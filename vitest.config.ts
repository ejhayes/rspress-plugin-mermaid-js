import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    server: {
      deps: {
        // rspress-plugin-devkit ships ESM dist without .js extensions on
        // internal imports, which Node's strict ESM resolver rejects. Running
        // it through Vite's transform pipeline resolves the extensions correctly.
        inline: ['rspress-plugin-devkit'],
      },
    },
  },
});
