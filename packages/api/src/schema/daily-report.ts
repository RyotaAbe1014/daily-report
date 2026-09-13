import { z } from 'zod';

/**
 * 日付は YYYY-MM-DD 固定。DynamoDB のソートキーになるため、
 * 辞書順と時系列順が一致することがこの形式に依存している。
 */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
  // Date.parse だけでは不十分。月の範囲外は NaN になるが、日の溢れは
  // 翌月へロールオーバーして通ってしまう（2026-02-30 -> 2026-03-02）。
  // 正規化した結果が入力と一致することまで確かめる。
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
 * セクション 1 件。body は Markdown をそのまま保持する。
 * サニタイズは表示側の責務なので、ここでは内容を書き換えない。
 */
export const SectionSchema = z.object({
  heading: z.string().min(1).max(200),
  // DynamoDB の 1 項目 400KB 制限に対する余裕を見た上限。
  body: z.string().min(1).max(100_000),
});

export const DailyReportSchema = z.object({
  date: DateSchema,
  sections: z.array(SectionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 作成・更新の入力。userId は含めない。認証コンテキストから取る。 */
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
  /** 範囲の下限。省略時は上限までの全期間。 */
  from: DateSchema.optional(),
  /** 範囲の上限。省略時は下限からの全期間。 */
  to: DateSchema.optional(),
  limit: z.number().int().min(1).max(100).default(31),
  order: z.enum(['asc', 'desc']).default('desc'),
  /** 前ページのレスポンスが返した cursor をそのまま渡す。 */
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
