import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketCollectAutoSettings } from '@/components/market/MarketCollectAutoSettings';
afterEach(cleanup);
const settings = { autoCollectEnabled: true, collectTime: '09:30', collectDaysAgo: 0, collectDays: [1], corporationCodes: ['11000101'], targetProducts: ['토마토'], defaultViewDays: 30, retentionDays: 365, autoCleanupEnabled: false };
const props = () => ({ settings, corporations: [{ code: '11000101', name: '서울청과', selected: true }], saving: false, hasUnsavedChanges: false, autoSettingsOpen: true, onAutoSettingsOpenChange: vi.fn(), onSettingsChange: vi.fn(), onSave: vi.fn(), onReset: vi.fn() });
it('preserves cleanup OFF and its period when another setting changes or the server reloads', () => {
  const p = props(); const { rerender } = render(<MarketCollectAutoSettings {...p} />);
  expect(screen.getByLabelText('오래된 원본 자동 정리')).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByLabelText('원본 보관 기간 (일)')).toBeDisabled();
  expect(screen.getByLabelText('원본 보관 기간 (일)')).toHaveValue(365);
  fireEvent.click(screen.getByRole('button', { name: /^포도$/ }));
  expect(p.onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ autoCleanupEnabled: false, retentionDays: 365, targetProducts: ['토마토', '포도'] }));
  fireEvent.click(screen.getByRole('button', { name: '설정 저장' }));
  expect(p.onSave).toHaveBeenCalledOnce();
  rerender(<MarketCollectAutoSettings {...p} settings={{ ...settings }} />);
  expect(screen.getByLabelText('오래된 원본 자동 정리')).toHaveAttribute('aria-checked', 'false');
});
it('enables cleanup only through its switch and warns about loss of old history', () => {
  const p = props(); const { rerender } = render(<MarketCollectAutoSettings {...p} />);
  fireEvent.click(screen.getByLabelText('오래된 원본 자동 정리'));
  expect(p.onSettingsChange).toHaveBeenCalledWith({ ...settings, autoCleanupEnabled: true });
  rerender(<MarketCollectAutoSettings {...p} settings={{ ...settings, autoCleanupEnabled: true, retentionDays: 90 }} />);
  expect(screen.getByLabelText('원본 보관 기간 (일)')).toHaveValue(90);
  expect(screen.getByRole('alert')).toHaveTextContent('가격 이력을 잃을 수');
});
it('prevents saving an invalid retention period', () => {
  render(<MarketCollectAutoSettings {...props()} settings={{ ...settings, autoCleanupEnabled: true, retentionDays: 0 }} />);
  expect(screen.getByRole('button', { name: '설정 저장' })).toBeDisabled();
});
