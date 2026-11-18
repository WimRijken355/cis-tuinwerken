"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUser } from "@/lib/auth-client";
import { APP_VERSION } from "@/lib/version";
import {
  isActivePath,
  isSettingsPath,
  MAIN_ITEMS,
  SETTINGS_GROUP,
  SETTINGS_ITEMS,
  visibleItems,
  type NavItem,
} from "./nav-items";

/**
 * App-shell navigation:
 * - wide screens (md+): fixed sidebar with a collapsible "Instellingen" group
 * - narrow screens: bottom tabs; the settings pages are reached via "Meer"
 *   and switch between each other with <SettingsSubnav> (see (settings)/layout.tsx).
 * Items come from nav-items.ts.
 */

function useIsAdmin(): boolean {
  const { data } = useCurrentUser();
  return data?.user?.role === "ADMIN";
}

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const inSettings = isSettingsPath(pathname);
  // null = follow the route (open while on a settings page); boolean = user toggled.
  const [settingsOpenChoice, setSettingsOpenChoice] = useState<boolean | null>(null);
  const settingsOpen = settingsOpenChoice ?? inSettings;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="text-2xl">🌿</span>
        <span className="font-bold text-brand-700">Tuinwerken Cis</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {visibleItems(MAIN_ITEMS, isAdmin).map((item) => (
          <SidebarLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
        ))}

        <button
          type="button"
          onClick={() => setSettingsOpenChoice(!settingsOpen)}
          aria-expanded={settingsOpen}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${
            inSettings && !settingsOpen ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span>{SETTINGS_GROUP.icon}</span>
          <span className="flex-1">{SETTINGS_GROUP.label}</span>
          <span className={`text-xs text-gray-400 transition-transform ${settingsOpen ? "rotate-90" : ""}`}>▶</span>
        </button>
        {settingsOpen && (
          <div className="ml-4 space-y-1 border-l border-gray-100 pl-2">
            {visibleItems(SETTINGS_ITEMS, isAdmin).map((item) => (
              <SidebarLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
            ))}
          </div>
        )}
      </nav>
      <button
        type="button"
        onClick={() => void logout()}
        className="m-2 rounded-md px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
      >
        ↩ Afmelden
      </button>
      <div className="px-4 pb-3 text-xs text-gray-400">v{APP_VERSION}</div>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span>{item.icon}</span>
      {item.labelLong ?? item.label}
    </Link>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const tabs = [
    ...visibleItems(MAIN_ITEMS, isAdmin, false).map((item) => ({
      ...item,
      active: isActivePath(pathname, item.href),
    })),
    {
      href: "/settings",
      label: SETTINGS_GROUP.shortLabel,
      icon: SETTINGS_GROUP.icon,
      active: isSettingsPath(pathname),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            tab.active ? "text-brand-700" : "text-gray-500"
          }`}
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Mobile-only tab row on top of every settings page, so all settings pages
 * are reachable on a phone (the bottom tabs only link to /settings).
 */
export function SettingsSubnav() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  return (
    <nav
      aria-label="Instellingen"
      className="sticky top-0 z-10 -mx-0 flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 md:hidden"
    >
      {visibleItems(SETTINGS_ITEMS, isAdmin).map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm ${
              active ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {item.icon} {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
