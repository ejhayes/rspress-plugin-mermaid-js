import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { pluginMermaid } from './index.js';

describe('pluginMermaid', () => {
  it('returns a valid rspress plugin object', () => {
    const plugin = pluginMermaid();
    expect(plugin.name).toBe('rspress-plugin-mermaid-js');
    expect(plugin.markdown?.remarkPlugins).toHaveLength(1);
    expect(plugin.markdown?.globalComponents).toHaveLength(1);
    expect(plugin.builderConfig).toBeDefined();
  });

  it('accepts options without throwing', () => {
    expect(() => pluginMermaid({ mermaidConfig: { theme: 'dark' }, height: 600 })).not.toThrow();
  });

  it('component file exists on disk', () => {
    const plugin = pluginMermaid();
    const components = plugin.markdown?.globalComponents as string[];
    expect(existsSync(components[0])).toBe(true);
  });

  it('globalComponents points to MermaidDiagram.tsx', () => {
    const plugin = pluginMermaid();
    const components = plugin.markdown?.globalComponents as string[];
    expect(components[0]).toMatch(/MermaidDiagram\.tsx$/);
  });
});

describe('remark transformation', () => {
  it('transforms a mermaid code block into a MermaidDiagram JSX element', async () => {
    const plugin = pluginMermaid();
    const remarkPlugin = plugin.markdown!.remarkPlugins![0] as any;

    const processor = unified().use(remarkParse).use(remarkPlugin);

    const input = '```mermaid\ngraph TD\n  A --> B\n```\n';
    const tree = processor.parse(input);
    const result = (await processor.run(tree)) as any;

    const mdxElement = result.children.find(
      (node: any) => node.type === 'mdxJsxFlowElement' && node.name === 'MermaidDiagram',
    );

    expect(mdxElement).toBeDefined();
    expect(mdxElement.attributes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'mdxJsxAttribute', name: 'code' })]),
    );
  });

  it('does not transform non-mermaid code blocks', async () => {
    const plugin = pluginMermaid();
    const remarkPlugin = plugin.markdown!.remarkPlugins![0] as any;

    const processor = unified().use(remarkParse).use(remarkPlugin);

    const input = '```ts\nconst x = 1;\n```\n';
    const tree = processor.parse(input);
    const result = (await processor.run(tree)) as any;

    const mdxElement = result.children.find((node: any) => node.type === 'mdxJsxFlowElement');

    expect(mdxElement).toBeUndefined();
  });

  it('passes the diagram source code as the code prop', async () => {
    const plugin = pluginMermaid();
    const remarkPlugin = plugin.markdown!.remarkPlugins![0] as any;

    const processor = unified().use(remarkParse).use(remarkPlugin);

    const diagramCode = 'graph TD\n  A --> B';
    const input = `\`\`\`mermaid\n${diagramCode}\n\`\`\`\n`;
    const tree = processor.parse(input);
    const result = (await processor.run(tree)) as any;

    const mdxElement = result.children.find(
      (node: any) => node.type === 'mdxJsxFlowElement' && node.name === 'MermaidDiagram',
    );

    const codeAttr = mdxElement?.attributes?.find((a: any) => a.name === 'code');
    expect(codeAttr).toBeDefined();
  });
});
