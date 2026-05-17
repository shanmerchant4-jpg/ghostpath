import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/ghost/**', 'src/devkit/tools/**'],
      exclude: [
        'src/ghost/proxy.ts',
        'src/ghost/resource-monitor.ts',
        'src/ghost/ws-server.ts',
        'src/ghost/hosts.ts',
        'src/devkit/server.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
