"use client";

import { BottomTabs, SidebarNav } from "./app-nav";

/** Responsive raamwerk: sidebar op desktop, bottom-tabs op mobiel. */
export function AppNavShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <SidebarNav />
      {/* pb-20 zodat content niet achter de bottom-tabs verdwijnt op mobiel */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <BottomTabs />
    </div>
  );
}
