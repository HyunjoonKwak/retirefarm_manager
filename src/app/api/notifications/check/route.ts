import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 알림 생성 체크 및 자동 생성
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();
    const notificationsToCreate: Array<{
      userId: string;
      type: "INFO" | "WARNING" | "SUCCESS" | "ERROR" | "REMINDER" | "PRICE_ALERT" | "INVENTORY_ALERT" | "HARVEST_REMINDER";
      title: string;
      message: string;
      link?: string;
    }> = [];

    // 1. 재고 부족 알림 체크
    const lowStockItems = await prisma.inventoryItem.findMany({
      where: { userId },
    });

    for (const item of lowStockItems) {
      const current = Number(item.currentQuantity);
      const minimum = Number(item.minimumQuantity);

      if (current <= minimum && minimum > 0) {
        // 오늘 이미 같은 알림이 있는지 확인
        const existingAlert = await prisma.notification.findFirst({
          where: {
            userId,
            type: "INVENTORY_ALERT",
            title: { contains: item.name },
            createdAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            },
          },
        });

        if (!existingAlert) {
          notificationsToCreate.push({
            userId,
            type: "INVENTORY_ALERT",
            title: `재고 부족: ${item.name}`,
            message: `${item.name}의 재고가 ${current}${item.unit}로 최소 수량(${minimum}${item.unit}) 이하입니다.`,
            link: "/farm/inventory",
          });
        }
      }
    }

    // 2. 수확 예정 알림 체크 (7일 이내)
    const upcomingHarvests = await prisma.crop.findMany({
      where: {
        userId,
        status: "GROWING",
        expectedHarvestDate: {
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          gte: now,
        },
      },
    });

    for (const crop of upcomingHarvests) {
      const daysToHarvest = Math.ceil(
        (new Date(crop.expectedHarvestDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 오늘 이미 같은 알림이 있는지 확인
      const existingReminder = await prisma.notification.findFirst({
        where: {
          userId,
          type: "HARVEST_REMINDER",
          title: { contains: crop.name },
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          },
        },
      });

      if (!existingReminder) {
        notificationsToCreate.push({
          userId,
          type: "HARVEST_REMINDER",
          title: `수확 예정: ${crop.name}`,
          message: `${crop.name}${crop.variety ? ` (${crop.variety})` : ""}의 수확 예정일까지 ${daysToHarvest}일 남았습니다.`,
          link: "/farm/crops",
        });
      }
    }

    // 3. 은퇴 목표 D-Day 알림 (30일, 7일, 1일)
    const retirementGoal = await prisma.retirementGoal.findUnique({
      where: { userId },
    });

    if (retirementGoal) {
      const targetDate = new Date(retirementGoal.targetDate);
      const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const milestones = [30, 7, 1];
      for (const days of milestones) {
        if (daysRemaining === days) {
          const existingReminder = await prisma.notification.findFirst({
            where: {
              userId,
              type: "REMINDER",
              title: { contains: "은퇴 목표" },
              createdAt: {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              },
            },
          });

          if (!existingReminder) {
            notificationsToCreate.push({
              userId,
              type: "REMINDER",
              title: `은퇴 목표 D-${days}`,
              message: `설정하신 은퇴 목표일까지 ${days}일 남았습니다!`,
              link: "/retirement/goal",
            });
          }
          break;
        }
      }
    }

    // 알림 일괄 생성
    if (notificationsToCreate.length > 0) {
      await prisma.notification.createMany({
        data: notificationsToCreate,
      });
    }

    return NextResponse.json({
      created: notificationsToCreate.length,
      notifications: notificationsToCreate,
    });
  } catch (error) {
    console.error("Check notifications error:", error);
    return NextResponse.json(
      { error: "알림 체크 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
