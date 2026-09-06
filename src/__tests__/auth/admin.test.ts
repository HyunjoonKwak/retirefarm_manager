// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ default: { user: mocks } }));
import { authOptions } from '@/lib/auth/options';
const signIn = authOptions.callbacks!.signIn!;
const login = () => signIn({ user: { id: 'provider-user', email: 'new@example.test' }, account: { provider: 'kakao', providerAccountId: 'kakao-123', type: 'oauth' } });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('KAKAO_ADMIN_ID', ''); vi.stubEnv('KAKAO_ADMIN_USER_ID', ''); });
afterEach(() => vi.unstubAllEnvs());
describe('explicit admin enrollment', () => {
  it('never promotes the first unrelated login or takes over an existing admin', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await login()).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: 'USER' }) });
  });
  it('refuses email-only linking', async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'legacy', role: 'ADMIN' });
    expect(await login()).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('links only the configured Kakao ID to the explicitly selected unlinked admin', async () => {
    vi.stubEnv('KAKAO_ADMIN_ID', 'kakao-123'); vi.stubEnv('KAKAO_ADMIN_USER_ID', 'legacy-admin');
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'legacy-admin', role: 'ADMIN', kakaoId: null });
    expect(await login()).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'legacy-admin' }, data: expect.objectContaining({ kakaoId: 'kakao-123' }) });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('enrolls an already known user only when explicitly configured', async () => {
    vi.stubEnv('KAKAO_ADMIN_ID', 'kakao-123');
    mocks.findUnique.mockResolvedValueOnce({ id: 'known-user', role: 'USER', kakaoId: 'kakao-123' });
    expect(await login()).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'known-user' }, data: { role: 'ADMIN' } });
  });
  it('cannot replace an already linked administrator' , async () => {
    vi.stubEnv('KAKAO_ADMIN_ID', 'kakao-123'); vi.stubEnv('KAKAO_ADMIN_USER_ID', 'legacy-admin');
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'legacy-admin', role: 'ADMIN', kakaoId: 'someone-else' });
    expect(await login()).toBe(false); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('refreshes stale JWT privilege and invalidates a deleted user', async () => {
    const jwt = authOptions.callbacks!.jwt!;
    const args = { token: { id: 'old-admin', role: 'ADMIN' } } as Parameters<typeof jwt>[0];
    mocks.findUnique.mockResolvedValueOnce({ id: 'old-admin', role: 'USER', image: null });
    expect((await jwt(args)).role).toBe('USER');
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await jwt(args)).id).toBeUndefined();
  });
});
