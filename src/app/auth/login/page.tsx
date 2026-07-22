"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">로그인</CardTitle>
        <CardDescription className="text-center">
          RetireFarm Manager에 로그인하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full bg-[#FEE500] text-[#191919] hover:bg-[#FDD800] font-medium"
          size="lg"
          onClick={() => signIn("kakao", { callbackUrl: "/" })}
        >
          <MessageCircle className="mr-2 h-5 w-5" />
          카카오로 로그인
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          최초 로그인 시 자동으로 계정이 생성됩니다.
        </p>
      </CardContent>
    </Card>
  );
}
