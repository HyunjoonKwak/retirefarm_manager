import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import fs from "fs/promises";
import path from "path";

const BACKUP_DIR = process.env.BACKUP_DIR || "/backups";
const SQLITE_PATH = "/app/prisma/data/retirefarm.db";

// POST: 백업 복원
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json({ error: "파일명이 필요합니다." }, { status: 400 });
    }

    // 경로 조작 방지
    const safeName = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, safeName);

    // 파일 존재 확인
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: "백업 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    // 복원 전 현재 상태 백업 (안전장치)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preRestoreBackup = `pre_restore_${timestamp}.db`;
    const preRestorePath = path.join(BACKUP_DIR, preRestoreBackup);

    try {
      await fs.copyFile(SQLITE_PATH, preRestorePath);
    } catch (err) {
      console.error("Pre-restore backup failed:", err);
      // 기존 DB가 없어도 진행
    }

    // SQLite 파일 복원 (덮어쓰기)
    await fs.copyFile(filePath, SQLITE_PATH);

    return NextResponse.json({
      success: true,
      message: "데이터베이스가 복원되었습니다. 앱을 재시작하면 변경사항이 적용됩니다.",
      preRestoreBackup,
    });
  } catch (error) {
    console.error("Restore backup error:", error);
    return NextResponse.json({ error: "복원에 실패했습니다. 서버 로그를 확인하세요." }, { status: 500 });
  }
}
