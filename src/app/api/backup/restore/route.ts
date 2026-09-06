import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import { backupFilenameSchema, stageRestore, cancelPendingRestore } from '@/lib/backup/store';
import { backupError } from '@/lib/backup/errors';
const restoreSchema = z.object({ filename: backupFilenameSchema });
export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    const { filename } = restoreSchema.parse(await request.json());
    await stageRestore(filename);
    return NextResponse.json({ success: true, restartRequired: true,
      message: '백업 검증 및 복원 예약이 완료되었습니다. 앱을 재시작하면 복원 직전 안전 백업을 생성한 후 적용합니다.' });
  } catch (error) { return backupError(error, '복원 예약에 실패했습니다. 백업 형식·무결성과 서버 로그를 확인하세요.'); }
}
export async function DELETE() {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    await cancelPendingRestore();
    return NextResponse.json({ success: true, message: '복원 예약을 취소했습니다.' });
  } catch (error) { return backupError(error, '복원 예약 취소에 실패했습니다.'); }
}
