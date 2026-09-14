// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ marketCollectionSettings: { findMany: vi.fn() }, auctionResult: { deleteMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ default: db }));
import { cleanupOldAuctionData } from '@/lib/services/garak-collector';
beforeEach(() => { vi.clearAllMocks(); db.auctionResult.deleteMany.mockResolvedValue({ count: 3 }); });
it('preserves shared history when any user disables automatic cleanup', async () => {
  db.marketCollectionSettings.findMany.mockResolvedValue([{ retentionDays: 365, autoCleanupEnabled: false }, { retentionDays: 90, autoCleanupEnabled: true }]);
  expect(await cleanupOldAuctionData()).toEqual({ deletedCount: 0, retentionDays: 365 });
  expect(db.auctionResult.deleteMany).not.toHaveBeenCalled();
});
it('uses the longest requested retention when every user enables cleanup', async () => {
  db.marketCollectionSettings.findMany.mockResolvedValue([{ retentionDays: 365, autoCleanupEnabled: true }, { retentionDays: 90, autoCleanupEnabled: true }]);
  expect(await cleanupOldAuctionData()).toEqual({ deletedCount: 3, retentionDays: 365 });
  expect(db.auctionResult.deleteMany).toHaveBeenCalledOnce();
});
it('does not delete shared history without any configured retention policy', async () => {
  db.marketCollectionSettings.findMany.mockResolvedValue([]);
  await cleanupOldAuctionData();
  expect(db.auctionResult.deleteMany).not.toHaveBeenCalled();
});
