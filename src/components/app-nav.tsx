"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_VERSION } from "@/lib/version";

/**
 * Navigatie van de app-shell:
 * - breed scherm (md+): vaste sidebar links
 * - smal scherm: bottom-tabs (duimvriendelijk)
 * Alle schermen zijn op elk toesteltype bereikbaar.
 */

const ITEMS = [
  { href: "/today", label: "Vandaag", icon: "📋" },
  { href: "/upcoming-days", label: "Dagen", labelLong: "Komende dagen", icon: "🗓️" },
  { href: "/planning", label: "Planning", icon: "📅" },
  { href: "/customers", label: "Klanten", icon: "👥" },
  { href: "/invoices", label: "Facturen", icon: "🧾" },
  { href: "/settings", label: "Meer", labelLong: "Instellingen", icon: "⚙️" },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const isActive = useIsActive();
  const router = useRouter();

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
      <nav className="flex-1 space-y-1 px-2">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              isActive(item.href)
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span>{item.icon}</span>
            {"labelLong" in item ? item.labelLong : item.label}
          </Link>
        ))}
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

export function BottomTabs() {
  const isActive = useIsActive();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            isActive(item.href) ? "text-brand-700" : "text-gray-500"
          }`}
        >
          <span className="text-lg leading-none">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
