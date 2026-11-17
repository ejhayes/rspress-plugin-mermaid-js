import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { pluginMermaid } from './index.js';

describe('pluginMermaid', () => {
  it('returns a valid rspress plugin object', () => {
    const plugin = pluginMermaid();
    expect(plugin.name).toBe('rspress-plugin-mermaid-js');
    expect(plugin.markdown?.remarkPlugins).toHaveLength(2);
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
    const remarkPlugin = plugin.markdown!.remarkPlugins!.at(-1) as any;

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
    const remarkPlugin = plugin.markdown!.remarkPlugins!.at(-1) as any;

    const processor = unified().use(remarkParse).use(remarkPlugin);

    const input = '```ts\nconst x = 1;\n```\n';
    const tree = processor.parse(input);
    const result = (await processor.run(tree)) as any;

    const mdxElement = result.children.find((node: any) => node.type === 'mdxJsxFlowElement');

    expect(mdxElement).toBeUndefined();
  });

  it('passes the diagram source code as the code prop', async () => {
    const plugin = pluginMermaid();
    const remarkPlugin = plugin.markdown!.remarkPlugins!.at(-1) as any;

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

describe('file= include', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mermaid-include-'));
  mkdirSync(path.join(dir, 'docs/sub'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/diagrams'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/diagrams/a.mmd'), 'graph TD\n  Root --> A');
  writeFileSync(path.join(dir, 'docs/sub/b.mmd'), 'graph TD\n  Page --> B');
  writeFileSync(path.join(dir, 'outside.mmd'), 'graph TD\n  X --> Y');
  const page = path.join(dir, 'docs/sub/page.md');

  async function render(markdown: string, options = {}, pagePath = page) {
    const plugins = pluginMermaid(options).markdown!.remarkPlugins as any[];
    const processor = unified().use(remarkParse);
    plugins.forEach((p) => processor.use(p));
    const tree = processor.parse(markdown);
    const result = (await processor.run(tree, { path: pagePath } as any)) as any;
    const el = result.children.find((n: any) => n.name === 'MermaidDiagram');
    const code = el?.attributes.find((a: any) => a.name === 'code')?.value;
    return code as string;
  }

  it('resolves the path against root when set', async () => {
    const code = await render('```mermaid file=diagrams/a.mmd\n```\n', {
      root: path.join(dir, 'docs'),
    });
    expect(code).toBe('graph TD\n  Root --> A');
  });

  it("resolves the path against the page's directory without root", async () => {
    const code = await render('```mermaid file=b.mmd\n```\n');
    expect(code).toBe('graph TD\n  Page --> B');
  });

  it('accepts a quoted path', async () => {
    const code = await render('```mermaid file="b.mmd"\n```\n');
    expect(code).toBe('graph TD\n  Page --> B');
  });

  it('fails on a missing file and names the page and path', async () => {
    await expect(render('```mermaid file=nope.mmd\n```\n')).rejects.toThrow(
      /page\.md.*file="nope\.mmd".*not found/,
    );
  });

  it('fails when the path leaves root', async () => {
    await expect(
      render('```mermaid file=../outside.mmd\n```\n', { root: path.join(dir, 'docs') }),
    ).rejects.toThrow(/page\.md.*file="\.\.\/outside\.mmd".*outside root/);
  });

  it('fails when the path leaves the page directory without root', async () => {
    await expect(render('```mermaid file=../../outside.mmd\n```\n')).rejects.toThrow(
      /outside the page directory/,
    );
  });

  it('fails when a block has both file= and text', async () => {
    await expect(render('```mermaid file=b.mmd\ngraph TD\n  A --> B\n```\n')).rejects.toThrow(
      /page\.md.*file="b\.mmd".*also has diagram text/,
    );
  });

  it('leaves inline blocks unchanged', async () => {
    const code = await render('```mermaid\ngraph TD\n  A --> B\n```\n');
    expect(code).toBe('graph TD\n  A --> B');
  });
});
