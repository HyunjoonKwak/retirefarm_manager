import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || "/app/backups";
const DB_HOST = process.env.DATABASE_HOST || "db";
const DB_PORT = process.env.DATABASE_PORT || "5432";
const DB_NAME = process.env.DATABASE_NAME || "retirefarm";
const DB_USER = process.env.DATABASE_USER || "postgres";
const DB_PASSWORD = process.env.DATABASE_PASSWORD || "postgres";

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
    const preRestoreBackup = `pre_restore_${timestamp}.sql`;
    const preRestorePath = path.join(BACKUP_DIR, preRestoreBackup);

    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -F p > "${preRestorePath}"`;
    await execAsync(backupCommand);

    // 데이터베이스 복원 (기존 데이터 삭제 후 복원)
    // 1. 연결 종료
    const terminateCommand = `PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"`;

    try {
      await execAsync(terminateCommand);
    } catch {
      // 연결이 없을 수도 있음
    }

    // 2. 데이터베이스 드롭 및 재생성
    const dropCommand = `PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"`;
    const createCommand = `PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "CREATE DATABASE ${DB_NAME};"`;

    await execAsync(dropCommand);
    await execAsync(createCommand);

    // 3. 복원
    const restoreCommand = `PGPASSWORD="${DB_PASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} < "${filePath}"`;
    await execAsync(restoreCommand);

    return NextResponse.json({
      success: true,
      message: "데이터베이스가 복원되었습니다.",
      preRestoreBackup,
    });
  } catch (error) {
    console.error("Restore backup error:", error);
    return NextResponse.json({ error: "복원에 실패했습니다. 서버 로그를 확인하세요." }, { status: 500 });
  }
}
