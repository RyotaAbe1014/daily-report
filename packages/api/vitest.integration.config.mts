import { defineConfig } from 'vitest/config';

/**
 * 統合テスト用の設定ファイルです。DynamoDB Local (Docker) の起動が必要です。
 * 実行コマンド: `nx run @daily-report/api:test-integration`
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/api-integration',
  // モノレポ内の他パッケージへの参照は、package.json の exports ではなく
  // tsconfig.base.json の paths エイリアスで解決します（website パッケージと同様の構成）。
  resolve: { tsconfigPaths: true },
  test: {
    passWithNoTests: true,
    name: '@daily-report/api:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.integration.spec.ts'],
    // 同一テーブル内の同じキーを操作するテストが含まれるため、テストファイル間の並行実行を無効化しています。
    fileParallelism: false,
    reporters: ['default'],
    // 実行時に Powertools の構造化ログやメトリクスがリクエストごとに出力されてテスト結果が見づらくなるのを防ぐため、
    // テスト実行中は出力を抑制（サイレント）に設定しています。
    env: {
      POWERTOOLS_LOG_LEVEL: 'SILENT',
      POWERTOOLS_METRICS_DISABLED: 'true',
      POWERTOOLS_TRACE_ENABLED: 'false',
    },
  },
}));
