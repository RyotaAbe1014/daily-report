import { Entity } from 'electrodb';
import { getDynamoDBClient, resolveTableName } from '../client.js';

/**
 * 日報エンティティ。
 *
 * キー設計（シングルテーブル）:
 *   pk = $Db#user_<userId>          パーティションはユーザー単位
 *   sk = $dailyReport_1#date_<date> ソートは日付の降順・昇順スキャンに使う
 *
 * date は ISO 8601 の日付部分のみ（YYYY-MM-DD）。文字列の辞書順が
 * そのまま時系列順になるため、between で月次・週次の範囲取得ができる。
 *
 * 個人利用のみを前提としているため GSI は使っていない。
 * 将来チーム共有を足す場合は gsi1（日付横断）を追加する。
 */
export const createDailyReportEntity = async () =>
  new Entity(
    {
      model: {
        entity: 'dailyReport',
        version: '1',
        service: 'Db',
      },
      attributes: {
        userId: {
          type: 'string',
          required: true,
          readOnly: true,
        },
        /** YYYY-MM-DD 形式の対象日。ユーザーごとに一意。 */
        date: {
          type: 'string',
          required: true,
          readOnly: true,
          validate: /^\d{4}-\d{2}-\d{2}$/,
        },
        /**
         * 自由記述のセクション配列。順序は配列のとおりに保持する。
         * heading はユーザーが任意に決められるため固定の enum にはしない。
         */
        sections: {
          type: 'list',
          required: true,
          items: {
            type: 'map',
            properties: {
              heading: {
                type: 'string',
                required: true,
              },
              body: {
                type: 'string',
                required: true,
              },
            },
          },
        },
        createdAt: {
          type: 'string',
          required: true,
          default: () => new Date().toISOString(),
          readOnly: true,
        },
        updatedAt: {
          type: 'string',
          required: true,
          default: () => new Date().toISOString(),
          watch: '*',
          set: () => new Date().toISOString(),
        },
      },
      indexes: {
        primary: {
          pk: {
            field: 'pk',
            composite: ['userId'],
          },
          sk: {
            field: 'sk',
            composite: ['date'],
          },
        },
      },
    },
    { client: getDynamoDBClient(), table: await resolveTableName() },
  );

export type DailyReportEntity = Awaited<
  ReturnType<typeof createDailyReportEntity>
>;
