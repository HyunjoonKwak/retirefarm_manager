import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import fs from 'node:fs/promises';
import { backupFile, backupFilenameSchema } from '@/lib/backup/store';
import { backupError } from '@/lib/backup/errors';
export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    const filename = backupFilenameSchema.parse(request.nextUrl.searchParams.get('filename'));
    const bytes = await fs.readFile(await backupFile(filename));
    return new NextResponse(bytes, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    } });
  } catch (error) { return backupError(error, '백업 다운로드에 실패했습니다.'); }
}
