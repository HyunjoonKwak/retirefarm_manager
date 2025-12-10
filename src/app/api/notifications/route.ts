import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 알림 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    const whereClause: {
      userId: string;
      isRead?: boolean;
    } = { userId: session.user.id };

    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: {
          userId: session.user.id,
          isRead: false,
        },
      }),
    ]);

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      { error: "알림 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 알림 읽음 처리
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { action, notificationId } = body;

    if (action === "markAllRead") {
      // 모든 알림 읽음 처리
      await prisma.notification.updateMany({
        where: {
          userId: session.user.id,
          isRead: false,
        },
        data: { isRead: true },
      });
      return NextResponse.json({ message: "모든 알림을 읽음 처리했습니다." });
    }

    if (action === "markRead" && notificationId) {
      // 특정 알림 읽음 처리
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: session.user.id,
        },
      });

      if (!notification) {
        return NextResponse.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
      }

      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });

      return NextResponse.json({ message: "알림을 읽음 처리했습니다." });
    }

    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  } catch (error) {
    console.error("Update notification error:", error);
    return NextResponse.json(
      { error: "알림 업데이트 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 알림 삭제
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get("id");
    const deleteAll = searchParams.get("all") === "true";

    if (deleteAll) {
      // 모든 알림 삭제
      await prisma.notification.deleteMany({
        where: { userId: session.user.id },
      });
      return NextResponse.json({ message: "모든 알림을 삭제했습니다." });
    }

    if (notificationId) {
      // 특정 알림 삭제
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: session.user.id,
        },
      });

      if (!notification) {
        return NextResponse.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      return NextResponse.json({ message: "알림을 삭제했습니다." });
    }

    return NextResponse.json({ error: "삭제할 알림을 지정해주세요." }, { status: 400 });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json(
      { error: "알림 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
