// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn(), createBackup: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: { user: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/backup/store', async importOriginal => ({ ...await importOriginal<object>(), createBackup: mocks.createBackup }));
import * as backup from '@/app/api/backup/route';
import * as download from '@/app/api/backup/download/route';
import * as restore from '@/app/api/backup/restore/route';
import * as schedule from '@/app/api/backup/schedule/route';
const req = () => new NextRequest('http://localhost/api/backup?filename=backup_test.db');
const handlers = [() => backup.GET(), () => backup.POST(), () => backup.DELETE(req()), () => download.GET(req()), () => restore.POST(req()), () => restore.DELETE(), () => schedule.GET(), () => schedule.POST(req())];
beforeEach(() => vi.resetAllMocks());
it('all backup endpoints require a signed-in user', async () => {
  mocks.session.mockResolvedValue(null);
  for (const handle of handlers) expect((await handle()).status).toBe(401);
  expect(mocks.createBackup).not.toHaveBeenCalled();
});
it('all backup endpoints deny USER, including stale ADMIN JWTs and deleted accounts', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'user', role: 'ADMIN' } });
  for (const record of [{ role: 'USER' }, null]) {
    mocks.findUnique.mockResolvedValue(record);
    for (const handle of handlers) expect((await handle()).status).toBe(403);
  }
  expect(mocks.createBackup).not.toHaveBeenCalled();
});
it('current administrator can create a backup', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'admin' } }); mocks.findUnique.mockResolvedValue({ role: 'ADMIN' });
  mocks.createBackup.mockResolvedValue({ filename: 'backup_test.db', size: 1024 });
  expect((await backup.POST()).status).toBe(200); expect(mocks.createBackup).toHaveBeenCalledOnce();
});
it('rejects incomplete or fractional schedule fields before writing files', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'admin' } }); mocks.findUnique.mockResolvedValue({ role: 'ADMIN' });
  for (const body of [{ enabled: true }, { enabled: true, dayOfWeek: 0.5, hour: 2, minute: 0, retentionDays: 30 }]) {
    const response = await schedule.POST(new NextRequest('http://localhost/api/backup/schedule', { method: 'POST', body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
  }
});
