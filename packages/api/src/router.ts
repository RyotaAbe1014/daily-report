import { t } from './init.js';
import {
  createDailyReport,
  deleteDailyReport,
  getDailyReport,
  listDailyReports,
  updateDailyReport,
} from './procedures/daily-report.js';
import { echo } from './procedures/echo.js';

export const router = t.router;

export const appRouter = router({
  echo,
  dailyReport: router({
    get: getDailyReport,
    list: listDailyReports,
    create: createDailyReport,
    update: updateDailyReport,
    delete: deleteDailyReport,
  }),
});

export type AppRouter = typeof appRouter;
