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
  Download,
  LineChart,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
      {
        name: "농산물 시세",
        href: "/market",
        icon: TrendingUp,
        subItems: [
          { name: "시세 조회", href: "/market", icon: LineChart },
          { name: "데이터 수집", href: "/market/collect", icon: Download },
        ],
      },
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

interface SubItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: SubItem[];
}

interface SidebarContentProps {
  pathname: string;
}

function SidebarContent({ pathname }: SidebarContentProps) {
  // 하위 메뉴가 있는 항목의 펼침 상태 관리
  const [openItems, setOpenItems] = useState<string[]>(() => {
    // 현재 경로가 하위 메뉴에 포함되어 있으면 해당 메뉴 열기
    const initialOpen: string[] = [];
    navigation.forEach((section) => {
      section.items.forEach((item: NavItem) => {
        if (item.subItems?.some((sub) => pathname === sub.href || pathname.startsWith(sub.href + "/"))) {
          initialOpen.push(item.name);
        }
      });
    });
    return initialOpen;
  });

  const toggleItem = (name: string) => {
    setOpenItems((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const isActiveRoute = (href: string) => {
    if (href === "/market") {
      return pathname === "/market";
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <ScrollArea className="h-full py-6">
      <div className="space-y-6 px-3">
        {navigation.map((section) => (
          <div key={section.title}>
            <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h4>
            <div className="space-y-1">
              {section.items.map((item: NavItem) => {
                // 하위 메뉴가 있는 경우
                if (item.subItems && item.subItems.length > 0) {
                  const isOpen = openItems.includes(item.name);
                  const isChildActive = item.subItems.some((sub) => isActiveRoute(sub.href));

                  return (
                    <Collapsible
                      key={item.name}
                      open={isOpen}
                      onOpenChange={() => toggleItem(item.name)}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant={isChildActive ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-between",
                            isChildActive && "bg-secondary"
                          )}
                        >
                          <span className="flex items-center">
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.name}
                          </span>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 space-y-1 mt-1">
                        {item.subItems.map((subItem) => (
                          <Button
                            key={subItem.href}
                            variant={isActiveRoute(subItem.href) ? "secondary" : "ghost"}
                            className={cn(
                              "w-full justify-start text-sm",
                              isActiveRoute(subItem.href) && "bg-secondary"
                            )}
                            asChild
                          >
                            <Link href={subItem.href}>
                              <subItem.icon className="mr-2 h-3.5 w-3.5" />
                              {subItem.name}
                            </Link>
                          </Button>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                }

                // 하위 메뉴가 없는 경우
                return (
                  <Button
                    key={item.href}
                    variant={isActiveRoute(item.href) ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      isActiveRoute(item.href) && "bg-secondary"
                    )}
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.name}
                    </Link>
                  </Button>
                );
              })}
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
