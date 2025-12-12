import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import fs from "fs/promises";
import path from "path";

const BACKUP_DIR = process.env.BACKUP_DIR || "/backups";
const SQLITE_PATH = "/app/prisma/data/retirefarm.db";

// GET: 백업 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 백업 디렉토리 확인/생성
    try {
      await fs.access(BACKUP_DIR);
    } catch {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
    }

    // 백업 파일 목록 조회
    const files = await fs.readdir(BACKUP_DIR);
    const backups = await Promise.all(
      files
        .filter((f) => f.endsWith(".db") || f.endsWith(".db.gz"))
        .map(async (filename) => {
          const filePath = path.join(BACKUP_DIR, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            size: stats.size,
            sizeFormatted: formatFileSize(stats.size),
            createdAt: stats.mtime.toISOString(),
          };
        })
    );

    // 최신순 정렬
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ backups });
  } catch (error) {
    console.error("Get backups error:", error);
    return NextResponse.json({ error: "백업 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

// POST: 수동 백업 생성
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 백업 디렉토리 확인/생성
    try {
      await fs.access(BACKUP_DIR);
    } catch {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
    }

    // SQLite 파일 존재 확인
    try {
      await fs.access(SQLITE_PATH);
    } catch {
      return NextResponse.json({ error: "데이터베이스 파일을 찾을 수 없습니다." }, { status: 500 });
    }

    // 백업 파일명 생성 (타임스탬프)
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${timestamp}.db`;
    const filePath = path.join(BACKUP_DIR, filename);

    // SQLite 파일 복사
    await fs.copyFile(SQLITE_PATH, filePath);

    // 파일 정보 조회
    const stats = await fs.stat(filePath);

    return NextResponse.json({
      success: true,
      message: "백업이 생성되었습니다.",
      backup: {
        filename,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        createdAt: stats.mtime.toISOString(),
      },
    });
  } catch (error) {
    console.error("Create backup error:", error);
    return NextResponse.json({ error: "백업 생성에 실패했습니다." }, { status: 500 });
  }
}

// DELETE: 백업 파일 삭제
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return NextResponse.json({ error: "파일명이 필요합니다." }, { status: 400 });
    }

    // 경로 조작 방지
    const safeName = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, safeName);

    await fs.unlink(filePath);

    return NextResponse.json({
      success: true,
      message: "백업이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("Delete backup error:", error);
    return NextResponse.json({ error: "백업 삭제에 실패했습니다." }, { status: 500 });
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
