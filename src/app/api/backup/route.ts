import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import fs from 'node:fs/promises';
import path from 'node:path';
import { backupDirectory, backupFilenameSchema, backupFile, createBackup, hasPendingRestore } from '@/lib/backup/store';
import { backupError } from '@/lib/backup/errors';

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${Number((bytes / 1024 ** i).toFixed(2))} ${['B','KB','MB','GB'][i]}`;
}
export async function GET() {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    await fs.mkdir(backupDirectory(), { recursive: true, mode: 0o700 });
    const backups = [];
    for (const filename of await fs.readdir(backupDirectory())) {
      if (!backupFilenameSchema.safeParse(filename).success) continue;
      const stat = await fs.lstat(path.join(backupDirectory(), filename));
      if (!stat.isFile()) continue;
      backups.push({ filename, size: stat.size, sizeFormatted: formatFileSize(stat.size), createdAt: stat.mtime.toISOString() });
    }
    backups.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ backups, pendingRestore: await hasPendingRestore() });
  } catch (error) { return backupError(error, '백업 목록 조회에 실패했습니다.'); }
}
export async function POST() {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    const backup = await createBackup();
    return NextResponse.json({ success: true, message: '백업이 생성되었습니다.', backup: { ...backup, sizeFormatted: formatFileSize(backup.size), createdAt: new Date().toISOString() } });
  } catch (error) { return backupError(error, '백업 생성에 실패했습니다. 서버의 SQLite 도구와 저장 경로를 확인하세요.'); }
}
export async function DELETE(request: NextRequest) {
  try {
    const denied = await requireAdminUser(); if (denied) return denied;
    const filename = backupFilenameSchema.parse(request.nextUrl.searchParams.get('filename'));
    await fs.unlink(await backupFile(filename));
    return NextResponse.json({ success: true, message: '백업이 삭제되었습니다.' });
  } catch (error) { return backupError(error, '백업 삭제에 실패했습니다.'); }
}
