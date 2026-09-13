import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/api',
  test: {
    passWithNoTests: true,
    name: '@daily-report/api',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // 統合テストは DynamoDB Local (Docker) を必要とするため、
    // 既定のターゲットからは外す。test-integration で明示的に走らせる。
    exclude: ['**/node_modules/**', '**/*.integration.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../dist/packages/api/test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
