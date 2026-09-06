// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ funding: vi.fn(), setup: vi.fn(), goal: vi.fn(), cropFind: vi.fn(), cropUpdate: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ default: {
  fundingSource: { findMany: mocks.funding }, setupCostItem: { findMany: mocks.setup }, retirementGoal: { findUnique: mocks.goal },
  crop: { findFirst: mocks.cropFind, update: mocks.cropUpdate },
} }));
import { GET as fundingSummary } from '@/app/api/funding/summary/route';
import { PATCH as patchCrop } from '@/app/api/farm/crops/[id]/route';
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 6, 10)); });
afterEach(() => vi.useRealTimers());
it('summary includes last-day funding and keeps legacy decimal money without a 500', async () => {
  mocks.funding.mockResolvedValue([{ type: 'SAVINGS', status: 'COMPLETED', amount: new Prisma.Decimal('1500000.5'), expectedDate: new Date('2026-09-30T09:00:00+09:00') }]);
  mocks.setup.mockResolvedValue([{ estimatedCost: new Prisma.Decimal('1000000'), quantity: 2, subsidyAmount: new Prisma.Decimal('30000') }]);
  mocks.goal.mockResolvedValue({ monthlyLivingExpense: new Prisma.Decimal('100000'), bufferMonths: 6 });
  const response = await fundingSummary();
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.monthlyFlow.find((month: { month: string }) => month.month === '2026-09').amount).toBe('1500000.5');
  expect(data.summary.totalAmount).toBe('1500000.5');
  expect(data.summary.requiredAmount).toBe('2570000');
  expect(data.requiredBreakdown.initialLivingBuffer).toBe('600000');
});
it('editing a legacy completed crop freezes its old completion date and preserves provenance on later edits', async () => {
  const originalDate = new Date(2026, 5, 1);
  let stored = { id: 'crop', userId: 'owner', status: 'COMPLETED', completedAt: null as Date | null, completedAtEstimated: false, updatedAt: originalDate };
  mocks.cropFind.mockImplementation(async () => stored);
  mocks.cropUpdate.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), updatedAt: new Date() };
    return stored;
  });
  const edit = (body: object) => patchCrop(new NextRequest('http://localhost/api/farm/crops/crop', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'crop' }) });
  expect((await edit({ notes: 'first edit' })).status).toBe(200);
  expect(stored.completedAt).toEqual(originalDate); expect(stored.completedAtEstimated).toBe(true);
  expect((await edit({ notes: 'second edit' })).status).toBe(200);
  expect(stored.completedAt).toEqual(originalDate); expect(stored.completedAtEstimated).toBe(true);
  expect((await edit({ completedAt: '2026-05-30' })).status).toBe(200);
  expect(stored.completedAtEstimated).toBe(false);
});
