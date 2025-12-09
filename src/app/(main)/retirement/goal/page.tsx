import { PageContainer } from "@/components/layout";
import { RetirementGoalForm } from "@/components/retirement/RetirementGoalForm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

export default async function RetirementGoalPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const goal = await prisma.retirementGoal.findUnique({
    where: { userId: session.user.id },
  });

  const initialData = goal
    ? {
        targetDate: goal.targetDate.toISOString(),
        targetAmount: goal.targetAmount.toString(),
        monthlyLivingExpense: goal.monthlyLivingExpense.toString(),
        lifeExpectancy: goal.lifeExpectancy,
        inflationRate: Number(goal.inflationRate),
      }
    : null;

  return (
    <PageContainer
      title="은퇴 목표 설정"
      description="은퇴 목표일과 필요 자금을 설정하세요"
    >
      <div className="max-w-2xl">
        <RetirementGoalForm initialData={initialData} />
      </div>
    </PageContainer>
  );
}
