import { createDailyReportEntity } from '@daily-report/db';
import { TRPCError } from '@trpc/server';
import { authenticatedProcedure } from '../init.js';
import {
  DailyReportSchema,
  DeleteDailyReportInputSchema,
  DeleteDailyReportOutputSchema,
  GetDailyReportInputSchema,
  GetDailyReportOutputSchema,
  ListDailyReportsInputSchema,
  ListDailyReportsOutputSchema,
  SaveDailyReportInputSchema,
} from '../schema/index.js';

/**
 * ElectroDB エンティティの初期化には AppConfig からのテーブル名解決（非同期処理）が必要なため、
 * シングルトンとして生成して再利用します。
 * Lambda 実行環境がウォームスタートする限り、設定の取得は初回呼び出し時のみ行われます。
 */
let entityPromise: ReturnType<typeof createDailyReportEntity> | undefined;
const getEntity = () => {
  if (!entityPromise) {
    entityPromise = createDailyReportEntity();
  }
  return entityPromise;
};

/** DynamoDB の項目から API のレスポンス形式へ変換するヘルパー関数。セキュリティのため内部フィールド（userId）は除外します。 */
const toDailyReport = (item: {
  date: string;
  sections: { heading: string; body: string }[];
  createdAt: string;
  updatedAt: string;
}) => ({
  date: item.date,
  sections: item.sections,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

/** DynamoDB の条件付き書き込み失敗（ConditionalCheckFailed）を判定するヘルパー関数。 */
const isConditionalCheckFailure = (error: unknown): boolean =>
  error instanceof Error &&
  /ConditionalCheckFailed|conditional request failed/i.test(
    `${error.message} ${(error.cause as Error | undefined)?.message ?? ''}`,
  );

/**
 * 指定した日付の日報を取得します。該当する日報が存在しない場合は report に null を返却します。
 */
export const getDailyReport = authenticatedProcedure
  .input(GetDailyReportInputSchema)
  .output(GetDailyReportOutputSchema)
  .query(async ({ input, ctx }) => {
    const entity = await getEntity();
    const result = await entity
      .get({ userId: ctx.userId, date: input.date })
      .go();
    return { report: result.data ? toDailyReport(result.data) : null };
  });

/**
 * 日報の一覧を取得します。日付範囲による絞り込みおよびカーソルページネーションに対応しています。
 *
 * `from` と `to` はいずれも任意指定です。両方指定された場合は between、
 * 片側のみ指定された場合は gte / lte を用いて DynamoDB クエリを発行します。
 */
export const listDailyReports = authenticatedProcedure
  .input(ListDailyReportsInputSchema)
  .output(ListDailyReportsOutputSchema)
  .query(async ({ input, ctx }) => {
    if (input.from && input.to && input.from > input.to) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '`from` must not be later than `to`.',
      });
    }

    const entity = await getEntity();
    const base = entity.query.primary({ userId: ctx.userId });

    const query =
      input.from && input.to
        ? base.between({ date: input.from }, { date: input.to })
        : input.from
          ? base.gte({ date: input.from })
          : input.to
            ? base.lte({ date: input.to })
            : base;

    const result = await query.go({
      order: input.order,
      limit: input.limit,
      cursor: input.cursor ?? undefined,
    });

    return {
      reports: result.data.map(toDailyReport),
      cursor: result.cursor ?? null,
    };
  });

/**
 * 日報を新規作成します。同一日付の日報がすでに存在する場合は CONFLICT エラーを返します。
 *
 * 一意性は userId と date の複合主キー（pk + sk）によって保証されるため、
 * 事前の存在チェッククエリを行わずとも安全に重複作成を防止できます。
 */
export const createDailyReport = authenticatedProcedure
  .input(SaveDailyReportInputSchema)
  .output(DailyReportSchema)
  .mutation(async ({ input, ctx }) => {
    const entity = await getEntity();
    try {
      const result = await entity
        .create({
          userId: ctx.userId,
          date: input.date,
          sections: input.sections,
        })
        .go();
      return toDailyReport(result.data);
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A report for ${input.date} already exists.`,
        });
      }
      throw error;
    }
  });

/**
 * 既存の日報を更新します。指定日付の日報が存在しない場合は NOT_FOUND エラーを返します。
 *
 * ElectroDB の patch 操作は対象項目が存在することを条件に更新を行うため、
 * 事前に get で存在確認を行わずに 1 回の書き込みリクエストで完結します。
 */
export const updateDailyReport = authenticatedProcedure
  .input(SaveDailyReportInputSchema)
  .output(DailyReportSchema)
  .mutation(async ({ input, ctx }) => {
    const entity = await getEntity();
    try {
      const result = await entity
        .patch({ userId: ctx.userId, date: input.date })
        .set({ sections: input.sections })
        .go({ response: 'all_new' });
      return toDailyReport(result.data as Parameters<typeof toDailyReport>[0]);
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No report found for ${input.date}.`,
        });
      }
      throw error;
    }
  });

/**
 * 日報を削除します。指定日付の日報が存在しない場合も正常終了（成功扱い）とします（冪等性の担保）。
 */
export const deleteDailyReport = authenticatedProcedure
  .input(DeleteDailyReportInputSchema)
  .output(DeleteDailyReportOutputSchema)
  .mutation(async ({ input, ctx }) => {
    const entity = await getEntity();
    await entity.delete({ userId: ctx.userId, date: input.date }).go();
    return { date: input.date };
  });
