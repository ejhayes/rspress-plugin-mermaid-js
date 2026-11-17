import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RemarkCodeBlockToGlobalComponentPluginFactory } from 'rspress-plugin-devkit';
import type { RspressPlugin } from '@rspress/core';
import type { MermaidConfig } from 'mermaid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PluginMermaidOptions {
  /** Mermaid configuration passed to every diagram. */
  mermaidConfig?: MermaidConfig;
  /** Container height in pixels. Defaults to 480. */
  height?: number;
  /**
   * Directory that `file=` paths resolve against. When not set, paths resolve
   * against the directory of the page that holds the code block.
   */
  root?: string;
}

interface CodeNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  children?: CodeNode[];
}

const FILE_META = /(?:^|\s)file=(?:"([^"]*)"|'([^']*)'|(\S+))/;

/** Returns the path from a `file=<path>` entry in a code block's meta, if any. */
export function parseFileMeta(meta: string | null | undefined): string | undefined {
  const match = meta ? FILE_META.exec(meta) : null;
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/**
 * Remark step that fills a `mermaid` block's value from its `file=` path.
 * rspress-plugin-devkit passes only the block's text on, never its meta, so
 * this runs ahead of it.
 */
function createFileIncludePlugin(root: string | undefined) {
  return () => (tree: CodeNode, vfile: { path?: string }) => {
    const page = vfile.path ?? '(unknown page)';
    const visit = (node: CodeNode) => {
      if (node.type === 'code' && node.lang === 'mermaid') {
        const file = parseFileMeta(node.meta);
        if (file !== undefined) {
          node.value = readIncludedFile(file, page, root, node.value ?? '');
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

function readIncludedFile(
  file: string,
  page: string,
  root: string | undefined,
  text: string,
): string {
  const fail = (reason: string): never => {
    throw new Error(`[rspress-plugin-mermaid-js] ${page}: mermaid file="${file}" ${reason}`);
  };
  if (text.trim() !== '') {
    return fail('is set on a block that also has diagram text; use one or the other');
  }
  const base = root ? path.resolve(root) : path.dirname(path.resolve(page));
  const resolved = path.resolve(base, file);
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return fail(`resolves outside ${root ? 'root' : 'the page directory'} (${base})`);
  }
  try {
    return readFileSync(resolved, 'utf8');
  } catch {
    return fail(`was not found (looked for ${resolved})`);
  }
}

export function pluginMermaid(options: PluginMermaidOptions = {}): RspressPlugin {
  const { mermaidConfig = {}, height = 480, root } = options;

  const factory = new RemarkCodeBlockToGlobalComponentPluginFactory({
    components: [
      {
        lang: 'mermaid',
        componentPath: path.join(__dirname, '../components/MermaidDiagram.tsx'),
        childrenProvider: () => [],
        propsProvider: (code: string) => ({ code, config: mermaidConfig, height }),
      },
    ],
  });

  return {
    name: 'rspress-plugin-mermaid-js',
    markdown: {
      remarkPlugins: [createFileIncludePlugin(root), factory.remarkPlugin],
      globalComponents: factory.mdxComponents,
    },
    builderConfig: factory.builderConfig,
  };
}
