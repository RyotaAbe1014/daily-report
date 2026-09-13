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
 * エンティティはテーブル名の解決に非同期の設定読み取りを伴うため、
 * 一度だけ作って使い回す。Lambda の実行環境が再利用される限り
 * AppConfig への問い合わせは初回のみになる。
 */
let entityPromise: ReturnType<typeof createDailyReportEntity> | undefined;
const getEntity = () => {
  if (!entityPromise) {
    entityPromise = createDailyReportEntity();
  }
  return entityPromise;
};

/** DynamoDB の項目から API のレスポンス形へ変換する。userId は返さない。 */
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

/** ElectroDB のカーソルはそのまま不透明な文字列として往復させる。 */
const isConditionalCheckFailure = (error: unknown): boolean =>
  error instanceof Error &&
  /ConditionalCheckFailed|conditional request failed/i.test(
    `${error.message} ${(error.cause as Error | undefined)?.message ?? ''}`,
  );

/**
 * 指定日の日報を取得する。存在しなければ report は null。
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
 * 日報を一覧する。日付の範囲指定とページングに対応する。
 *
 * from と to はいずれも省略でき、両方指定した場合のみ between を使う。
 * 片側だけの指定は gte / lte に落とす。
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
 * 日報を新規作成する。同じ日付が既にある場合は CONFLICT。
 *
 * 一意性は userId と date の複合キーで保証されるため、
 * 事前に存在確認をしなくても競合を取りこぼさない。
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
 * 既存の日報を更新する。存在しない日付なら NOT_FOUND。
 *
 * patch は対象が存在することを条件に含めるため、
 * 取得してから書くのではなく 1 回の書き込みで済む。
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
 * 日報を削除する。存在しない日付を指定しても成功扱いにする。
 */
export const deleteDailyReport = authenticatedProcedure
  .input(DeleteDailyReportInputSchema)
  .output(DeleteDailyReportOutputSchema)
  .mutation(async ({ input, ctx }) => {
    const entity = await getEntity();
    await entity.delete({ userId: ctx.userId, date: input.date }).go();
    return { date: input.date };
  });
