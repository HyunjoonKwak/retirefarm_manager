import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import { backupScheduleSchema, readSchedule, saveSchedule } from '@/lib/backup/store';
import { isBackupSchedulerRunning } from '@/lib/backup/scheduler';
import { backupError } from '@/lib/backup/errors';
export async function GET() {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    return NextResponse.json({ schedule: await readSchedule(), schedulerRunning: isBackupSchedulerRunning() });
  } catch (error) { return backupError(error, '백업 스케줄 조회에 실패했습니다.'); }
}
export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    const schedule = await saveSchedule(backupScheduleSchema.parse(await request.json()));
    const schedulerRunning = isBackupSchedulerRunning();
    return NextResponse.json({ success: true, schedule, schedulerRunning,
      message: schedulerRunning ? '스케줄을 저장했습니다. 매분 최신 설정을 확인하여 한국 시간 기준으로 실행합니다.' : '스케줄을 저장했지만 자동 백업 실행기가 동작하지 않습니다. 앱을 재시작해 주세요.' });
  } catch (error) { return backupError(error, '백업 스케줄 저장에 실패했습니다.'); }
}
