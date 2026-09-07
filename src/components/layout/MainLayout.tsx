"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex min-w-0 flex-1">
        <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
        {/* min-w-0: flex 자식의 기본 min-width:auto가 긴 줄 때문에 페이지를 가로로 늘리는 것을 막는다. */}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
