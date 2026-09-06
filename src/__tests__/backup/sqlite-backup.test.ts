// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { createBackup, stageRestore, applyPendingRestore, pendingRestorePath, hasPendingRestore, cancelPendingRestore, saveSchedule, runScheduledBackup, backupFile } from '@/lib/backup/store';
let dir: string, db: string, backups: string;
const sql = (file: string, statement: string) => execFileSync(process.env.SQLITE_BIN || 'sqlite3', [file, statement], { encoding: 'utf8' }).trim();
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'retirefarm-test-')); db = path.join(dir, 'live.db'); backups = path.join(dir, 'backups');
  vi.stubEnv('DATABASE_URL', `file:${db}`); vi.stubEnv('BACKUP_DIR', backups); vi.stubEnv('CONFIG_DIR', path.join(backups, 'config'));
  sql(db, `CREATE TABLE User(id TEXT PRIMARY KEY, role TEXT, kakaoId TEXT); INSERT INTO User VALUES('owner','ADMIN',NULL);
    CREATE TABLE Crop(id TEXT); CREATE TABLE FundingSource(id TEXT); CREATE TABLE SetupCostItem(id TEXT);
    CREATE TABLE _prisma_migrations(migration_name TEXT, finished_at TEXT, rolled_back_at TEXT);`);
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(dir, { recursive: true, force: true }); });
it('stages gzip without changing live data; startup preserves latest data in a safety snapshot then restores', async () => {
  const backup = await createBackup();
  await fs.writeFile(path.join(backups, 'backup_compressed.db.gz'), gzipSync(await fs.readFile(path.join(backups, backup.filename))));
  sql(db, "INSERT INTO User VALUES('new','USER',NULL)");
  await stageRestore('backup_compressed.db.gz');
  expect(sql(db, 'SELECT count(*) FROM User')).toBe('2');
  expect(await hasPendingRestore()).toBe(true);
  const safety = await applyPendingRestore();
  expect(sql(db, 'SELECT count(*) FROM User')).toBe('1');
  expect(sql(path.join(backups, safety!.filename), 'SELECT count(*) FROM User')).toBe('2');
  expect(await hasPendingRestore()).toBe(false);
});
it('rejects corrupt backups without touching live DB or creating a restore reservation', async () => {
  await fs.mkdir(backups); await fs.writeFile(path.join(backups, 'backup_corrupt.db.gz'), gzipSync('not sqlite'));
  await expect(stageRestore('backup_corrupt.db.gz')).rejects.toThrow();
  expect(sql(db, 'SELECT count(*) FROM User')).toBe('1'); expect(await hasPendingRestore()).toBe(false);
});
it('does not overwrite an existing reservation and supports cancellation', async () => {
  const backup = await createBackup(); await stageRestore(backup.filename);
  await expect(stageRestore(backup.filename)).rejects.toMatchObject({ code: 'EEXIST' });
  await cancelPendingRestore(); expect(await hasPendingRestore()).toBe(false);
});
it('aborts restore when the safety backup cannot be created', async () => {
  const backup = await createBackup(); await stageRestore(backup.filename);
  sql(db, "INSERT INTO User VALUES('keep','USER',NULL)");
  const blocked = path.join(dir, 'not-directory'); await fs.writeFile(blocked, 'x'); vi.stubEnv('BACKUP_DIR', blocked);
  await expect(applyPendingRestore()).rejects.toThrow();
  expect(sql(db, 'SELECT count(*) FROM User')).toBe('2'); expect(await hasPendingRestore()).toBe(true);
});
it('rejects path traversal and symlinks', async () => {
  await fs.mkdir(backups); await fs.symlink(db, path.join(backups, 'backup_link.db'));
  await expect(backupFile('../live.db')).rejects.toThrow(); await expect(backupFile('backup_link.db')).rejects.toThrow();
});
it('fails closed after an interrupted restore instead of silently restoring again', async () => {
  await fs.writeFile(`${pendingRestorePath()}.applying`, 'interrupted');
  await expect(applyPendingRestore()).rejects.toThrow('이전 복원이 중단');
});
it('reads changed schedule from the shared file, honors KST, and deduplicates one time slot', async () => {
  await saveSchedule({ enabled: true, dayOfWeek: 0, hour: 2, minute: 0, retentionDays: 30 });
  expect(await runScheduledBackup(new Date('2026-09-05T16:00:00Z'))).toBeNull();
  expect(await runScheduledBackup(new Date('2026-09-05T17:00:00Z'))).toBeTruthy();
  expect(await runScheduledBackup(new Date('2026-09-05T17:00:30Z'))).toBeNull();
  await saveSchedule({ enabled: false, dayOfWeek: 0, hour: 2, minute: 0, retentionDays: 30 });
  expect(await runScheduledBackup(new Date('2026-09-12T17:00:00Z'))).toBeNull();
});

it('online snapshot includes committed WAL data while another connection stays open', async () => {
  const connection = new Database(db);
  try {
    connection.pragma('journal_mode = WAL');
    connection.pragma('wal_autocheckpoint = 0');
    connection.prepare("INSERT INTO User VALUES('wal-user','USER',NULL)").run();
    expect((await fs.stat(`${db}-wal`)).size).toBeGreaterThan(0);
    const backup = await createBackup();
    expect(sql(path.join(backups, backup.filename), 'SELECT count(*) FROM User')).toBe('2');
  } finally { connection.close(); }
});
it('scheduled retention removes ordinary old backups but preserves pre-restore snapshots', async () => {
  const ordinary = await createBackup();
  const safety = await createBackup('pre_restore');
  const old = new Date('2026-08-01T00:00:00Z');
  for (const backup of [ordinary, safety]) await fs.utimes(path.join(backups, backup.filename), old, old);
  await saveSchedule({ enabled: true, dayOfWeek: 0, hour: 2, minute: 0, retentionDays: 1 });
  await runScheduledBackup(new Date('2026-09-05T17:00:00Z'));
  await expect(fs.access(path.join(backups, ordinary.filename))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(path.join(backups, safety.filename))).resolves.toBeUndefined();
});
