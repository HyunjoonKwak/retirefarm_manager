"use client";

/**
 * 온보딩 유도 배너 — 농장 프로필이 없는 사용자에게만 노출.
 * 강제 리다이렉트 대신 배너로 유도한다 (기존 사용자 흐름 보존).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sprout, ChevronRight } from "lucide-react";

export function OnboardingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch("/api/onboarding");
        if (!response.ok) return;
        const result = await response.json();
        if (!cancelled && result.success && !result.data.completed) {
          setShow(true);
        }
      } catch {
        // 배너는 부가 기능 — 조회 실패 시 조용히 숨긴다
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
      <CardContent className="flex items-center gap-4 py-4">
        <Sprout className="h-8 w-8 shrink-0 text-green-600" />
        <div className="flex-1">
          <p className="font-medium">농장 프로필을 설정해 보세요</p>
          <p className="text-sm text-muted-foreground">
            지역·재배 형태·예정 작물을 등록하면 시세 워치리스트가 자동 구성됩니다.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/onboarding">
            시작하기 <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
