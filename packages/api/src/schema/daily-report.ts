import { z } from 'zod';

/**
 * 日付は YYYY-MM-DD 形式に固定します。
 * DynamoDB のソートキーとして利用するため、辞書順と時系列順が一致するこの形式が必須となります。
 */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
  // Date.parse 単体では日の超過分が翌月にロールオーバーして受理されてしまうため（例: 2026-02-30 -> 2026-03-02）、
  // パース後の ISO 文字列に再変換し、元の入力値と一致するかどうかで実在する日付かを厳密に判定します。
  .refine(
    (value) => {
      const parsed = Date.parse(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(parsed) &&
        new Date(parsed).toISOString().startsWith(`${value}T`)
      );
    },
    { message: 'date must be a real calendar date' },
  );

/**
 * 日報内の各セクション。Markdown 形式の文字列を保持します。
 * サニタイズ（XSS 対策等）はフロントエンドの表示側で実施するため、ここでは内容を改変せずそのまま格納します。
 */
export const SectionSchema = z.object({
  heading: z.string().min(1).max(200),
  // DynamoDB の 1 項目あたりのサイズ制限（400KB）を考慮し、余裕を持たせた上限値（100,000文字）。
  body: z.string().min(1).max(100_000),
});

export const DailyReportSchema = z.object({
  date: DateSchema,
  sections: z.array(SectionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 日報の作成・更新時の入力スキーマ。セキュリティの観点から userId は含めず、認証コンテキストから取得します。 */
export const SaveDailyReportInputSchema = z.object({
  date: DateSchema,
  sections: z.array(SectionSchema).min(1).max(20),
});

export const GetDailyReportInputSchema = z.object({
  date: DateSchema,
});

export const GetDailyReportOutputSchema = z.object({
  report: DailyReportSchema.nullable(),
});

export const ListDailyReportsInputSchema = z.object({
  /** 取得範囲の開始日（下限）。省略時は上限までの全期間を対象とします。 */
  from: DateSchema.optional(),
  /** 取得範囲の終了日（上限）。省略時は下限からの全期間を対象とします。 */
  to: DateSchema.optional(),
  limit: z.number().int().min(1).max(100).default(31),
  order: z.enum(['asc', 'desc']).default('desc'),
  /** ページネーション用カーソル。前回のレスポンスで返却された cursor 値をそのまま渡します。 */
  cursor: z.string().nullish(),
});

export const ListDailyReportsOutputSchema = z.object({
  reports: z.array(DailyReportSchema),
  cursor: z.string().nullable(),
});

export const DeleteDailyReportInputSchema = z.object({
  date: DateSchema,
});

export const DeleteDailyReportOutputSchema = z.object({
  date: DateSchema,
});

export type ISection = z.TypeOf<typeof SectionSchema>;
export type IDailyReport = z.TypeOf<typeof DailyReportSchema>;
export type ISaveDailyReportInput = z.TypeOf<typeof SaveDailyReportInputSchema>;
export type IListDailyReportsInput = z.TypeOf<
  typeof ListDailyReportsInputSchema
>;
