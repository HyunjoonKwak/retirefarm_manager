import cron, { type ScheduledTask } from 'node-cron';
import { runScheduledBackup } from '../../../scripts/sqlite-backup.mjs';
import { logger } from '@/lib/logger';

const state = globalThis as typeof globalThis & { backupCron?: ScheduledTask };
export function startBackupScheduler() {
  if (state.backupCron) return;
  state.backupCron = cron.schedule('* * * * *', async () => {
    try { await runScheduledBackup(); }
    catch (error) { logger.error('Scheduled backup failed:', error); }
  }, { timezone: 'Asia/Seoul', noOverlap: true });
}
export function isBackupSchedulerRunning() { return Boolean(state.backupCron); }
