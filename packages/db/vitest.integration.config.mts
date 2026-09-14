import { defineConfig } from 'vitest/config';

/**
 * 統合テスト用の設定ファイルです。DynamoDB Local (Docker) の起動が必要です。
 * 実行コマンド: `nx run @daily-report/db:test-integration`
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
    // 同一テーブル内の同じキーを操作するテストが含まれるため、テストファイル間の並行実行を無効化しています。
    fileParallelism: false,
    reporters: ['default'],
  },
}));
