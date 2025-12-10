"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Home,
  Target,
  Building2,
  Hammer,
  Leaf,
  TrendingUp,
  Settings,
  Calendar,
  Wallet,
  Package,
  BarChart3,
} from "lucide-react";

const navigation = [
  {
    title: "메인",
    items: [
      { name: "대시보드", href: "/", icon: Home },
    ],
  },
  {
    title: "스마트팜 준비",
    items: [
      { name: "준비 플래너", href: "/plan", icon: Target },
      { name: "설립 비용", href: "/setup", icon: Hammer },
      { name: "부동산 자산", href: "/assets", icon: Building2 },
    ],
  },
  {
    title: "농장 운영",
    items: [
      { name: "영농일지", href: "/farm/logs", icon: Calendar },
      { name: "작물 관리", href: "/farm/crops", icon: Leaf },
      { name: "재무 관리", href: "/farm/finance", icon: Wallet },
      { name: "재고 관리", href: "/farm/inventory", icon: Package },
    ],
  },
  {
    title: "시세 정보",
    items: [
      { name: "농산물 시세", href: "/market", icon: TrendingUp },
    ],
  },
  {
    title: "분석",
    items: [
      { name: "리포트", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "설정",
    items: [
      { name: "설정", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarContentProps {
  pathname: string;
}

function SidebarContent({ pathname }: SidebarContentProps) {
  return (
    <ScrollArea className="h-full py-6">
      <div className="space-y-6 px-3">
        {navigation.map((section) => (
          <div key={section.title}>
            <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h4>
            <div className="space-y-1">
              {section.items.map((item) => (
                <Button
                  key={item.href}
                  variant={pathname === item.href ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start",
                    pathname === item.href && "bg-secondary"
                  )}
                  asChild
                >
                  <Link href={item.href}>
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

interface SidebarProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Sidebar */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-14 items-center border-b px-4">
            <span className="text-lg font-bold text-primary">RetireFarm</span>
          </div>
          <SidebarContent pathname={pathname} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r bg-background md:block">
        <SidebarContent pathname={pathname} />
      </aside>
    </>
  );
}
