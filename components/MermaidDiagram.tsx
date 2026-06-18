import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import mermaid, { type MermaidConfig } from 'mermaid';
// panzoom (anvaka) ships no types; the surface we use is declared inline.
import createPanzoom from 'panzoom';

interface PanZoomInstance {
  zoomAbs(x: number, y: number, scale: number): void;
  smoothZoom(x: number, y: number, scale: number): void;
  moveTo(x: number, y: number): void;
  dispose(): void;
}

export interface MermaidDiagramProps {
  code: string;
  config?: MermaidConfig;
  height?: number;
}

// mermaid v10 keeps global state — concurrent render() calls corrupt each
// other. Serialize every render through this shared queue.
let mermaidQueue: Promise<void> = Promise.resolve();

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, config = {}, height = 480 }) => {
  const id = useId();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const pzRef = useRef<PanZoomInstance | null>(null);
  const fullscreenRef = useRef(false);
  const renderSeq = useRef(0);

  // Keep ref in sync so the panzoom wheel handler reads current value.
  useEffect(() => {
    fullscreenRef.current = fullscreen;
  }, [fullscreen]);

  // Stabilize config identity — a fresh `{}` default would re-trigger render → setSvg → loop.
  const configKey = JSON.stringify(config ?? {});

  const renderDiagram = useCallback(() => {
    renderSeq.current += 1;
    const mySeq = renderSeq.current;
    const dark = document.documentElement.classList.contains('dark');
    // Unique id per call: mermaid v10 keys a temp DOM node on this id.
    const renderId = `md-${id.replace(/[^a-zA-Z0-9]/g, '')}-${mySeq}`;

    const work = async () => {
      try {
        mermaid.initialize({
          securityLevel: 'loose',
          startOnLoad: false,
          theme: dark ? 'dark' : 'default',
          ...(JSON.parse(configKey) as MermaidConfig),
        });
        const { svg: out } = await mermaid.render(renderId, code);
        if (mySeq === renderSeq.current) {
          setSvg(out);
          setError(null);
        }
      } catch (err) {
        if (mySeq === renderSeq.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    mermaidQueue = mermaidQueue.then(work, work);
  }, [code, configKey, id]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  // Re-render only when the site theme (light/dark) actually toggles.
  useEffect(() => {
    let prevDark = document.documentElement.classList.contains('dark');
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      if (dark !== prevDark) {
        prevDark = dark;
        renderDiagram();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [renderDiagram]);

  // Track native fullscreen changes (e.g. user pressing Esc).
  useEffect(() => {
    const onChange = () =>
      setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Attach panzoom once SVG is in the DOM; re-attach when it re-renders.
  useEffect(() => {
    const wrap = svgWrapRef.current;
    if (!svg || !wrap) return;
    const svgEl = wrap.querySelector('svg');
    if (!svgEl) return;

    svgEl.style.maxWidth = 'none';
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';

    const instance = createPanzoom(wrap, {
      maxZoom: 12,
      minZoom: 0.2,
      smoothScroll: false,
      // Outside fullscreen, only zoom on wheel with ⌘/Ctrl so the page can
      // still scroll past the diagram.
      beforeWheel: (e: WheelEvent) =>
        !(fullscreenRef.current || e.ctrlKey || e.metaKey),
    }) as unknown as PanZoomInstance;
    pzRef.current = instance;

    return () => {
      instance.dispose();
      pzRef.current = null;
    };
  }, [svg]);

  const zoomBy = (factor: number) => {
    const pz = pzRef.current;
    const box = containerRef.current;
    if (!pz || !box) return;
    const rect = box.getBoundingClientRect();
    pz.smoothZoom(rect.width / 2, rect.height / 2, factor);
  };

  const reset = () => {
    const pz = pzRef.current;
    if (!pz) return;
    pz.zoomAbs(0, 0, 1);
    pz.moveTo(0, 0);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen?.();
    } else {
      await el.requestFullscreen?.();
    }
  };

  if (error) {
    return (
      <div style={{ margin: '16px 0' }}>
        <div style={{ color: 'var(--rp-c-danger-1, #d5393e)', fontSize: 13, marginBottom: 4 }}>
          Mermaid render failed: {error}
        </div>
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  const btn: React.CSSProperties = {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--rp-c-divider, #e2e2e3)',
    borderRadius: 6,
    background: 'var(--rp-c-bg, #fff)',
    color: 'var(--rp-c-text-1, #213547)',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    padding: 0,
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height: fullscreen ? '100vh' : height,
        width: '100%',
        overflow: 'hidden',
        border: '1px solid var(--rp-c-divider, #e2e2e3)',
        borderRadius: 8,
        background: 'var(--rp-c-bg, #fff)',
        margin: '16px 0',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 2,
          display: 'flex',
          gap: 4,
        }}
      >
        <button style={btn} onClick={() => zoomBy(1.3)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        <button style={btn} onClick={() => zoomBy(1 / 1.3)} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <button style={btn} onClick={reset} title="Reset view" aria-label="Reset view">
          ⟳
        </button>
        <button
          style={btn}
          onClick={toggleFullscreen}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? '✕' : '⛶'}
        </button>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 8,
          zIndex: 2,
          fontSize: 11,
          color: 'var(--rp-c-text-2, #888)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        drag to pan · {fullscreen ? 'scroll' : '⌘/Ctrl + scroll'} to zoom
      </div>

      <div
        ref={svgWrapRef}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

export default MermaidDiagram;
