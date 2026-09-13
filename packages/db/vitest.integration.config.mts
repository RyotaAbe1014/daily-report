import { defineConfig } from 'vitest/config';

/**
 * 統合テスト用の設定。DynamoDB Local (Docker) を必要とする。
 * `nx run @daily-report/db:test-integration` から使う。
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/db-integration',
  test: {
    passWithNoTests: true,
    name: '@daily-report/db:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.integration.spec.ts'],
    // 同じテーブルの同じキーを触るため、ファイル間で並行させない。
    fileParallelism: false,
    reporters: ['default'],
  },
}));
