import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BackupValidationError } from './store';
export function backupError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
  if (error instanceof BackupValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: '올바른 JSON 형식이 필요합니다.' }, { status: 400 });
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return NextResponse.json({ error: '백업 파일 또는 필요한 저장 경로를 찾을 수 없습니다.' }, { status: 404 });
  if (code === 'EEXIST') return NextResponse.json({ error: '이미 복원이 예약되어 있습니다. 기존 예약을 취소한 뒤 다시 시도하세요.' }, { status: 409 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
