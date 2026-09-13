import { defineConfig } from 'vitest/config';

/**
 * 統合テスト用の設定。DynamoDB Local (Docker) を必要とする。
 * `nx run @daily-report/api:test-integration` から使う。
 */
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/api-integration',
  // ワークスペース内のパッケージは package.json の exports ではなく
  // tsconfig.base.json の paths で解決している。website と同じ設定。
  resolve: { tsconfigPaths: true },
  test: {
    passWithNoTests: true,
    name: '@daily-report/api:integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.integration.spec.ts'],
    // 同じテーブルの同じキーを触るため、ファイル間で並行させない。
    fileParallelism: false,
    reporters: ['default'],
    // powertools の構造化ログとメトリクスが 1 リクエストごとに出るため、
    // テスト結果が埋もれる。エラーを検証するテストも含むので黙らせる。
    env: {
      POWERTOOLS_LOG_LEVEL: 'SILENT',
      POWERTOOLS_METRICS_DISABLED: 'true',
      POWERTOOLS_TRACE_ENABLED: 'false',
    },
  },
}));
