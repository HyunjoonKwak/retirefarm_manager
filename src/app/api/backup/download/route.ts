import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import fs from "fs/promises";
import path from "path";

const BACKUP_DIR = process.env.BACKUP_DIR || "/app/backups";

// GET: 백업 파일 다운로드
export async function GET(request: NextRequest) {
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

    // 파일 존재 확인
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    // 파일 읽기
    const fileBuffer = await fs.readFile(filePath);

    // 응답 생성
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Download backup error:", error);
    return NextResponse.json({ error: "다운로드에 실패했습니다." }, { status: 500 });
  }
}
