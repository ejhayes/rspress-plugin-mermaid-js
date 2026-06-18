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
}

export function pluginMermaid(options: PluginMermaidOptions = {}): RspressPlugin {
  const { mermaidConfig = {}, height = 480 } = options;

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
      remarkPlugins: [factory.remarkPlugin],
      globalComponents: factory.mdxComponents,
    },
    builderConfig: factory.builderConfig,
  };
}
