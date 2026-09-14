import { Entity } from 'electrodb';
import { getDynamoDBClient, resolveTableName } from '../client.js';

/**
 * 日報（DailyReport）の ElectroDB エンティティ定義。
 *
 * キー設計（シングルテーブルパターン）:
 *   pk = $Db#user_<userId>          パーティションキー: ユーザー単位でデータを分離
 *   sk = $dailyReport_1#date_<date> ソートキー: 日付による昇順・降順ソートおよび範囲取得に使用
 *
 * date は ISO 8601 の日付部分（YYYY-MM-DD 形式）のみを保持します。
 * 文字列の辞書順がそのまま時系列順と一致するため、between クエリを用いて月次や週次などの範囲取得が効率的に行えます。
 *
 * ※ 現状はユーザー個人の利用を前提としているため GSI は定義していません。
 * 将来的にチーム共有などの機能を追加する際は、日付を軸にした横断検索用 GSI（gsi1 等）の追加を検討してください。
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
        /** YYYY-MM-DD 形式の日報対象日。ユーザーごとに一意（重複不可）。 */
        date: {
          type: 'string',
          required: true,
          readOnly: true,
          validate: /^\d{4}-\d{2}-\d{2}$/,
        },
        /**
         * 自由記述形式のセクション一覧。配列の順序をそのまま保持します。
         * heading（見出し）はユーザーが自由に命名できる仕様とし、固定値（enum）にはしていません。
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
