"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth-client";
import { APP_VERSION } from "@/lib/version";

/**
 * Navigatie van de app-shell:
 * - breed scherm (md+): vaste sidebar links
 * - smal scherm: bottom-tabs (duimvriendelijk)
 * Alle schermen zijn op elk toesteltype bereikbaar, behalve adminOnly-items.
 */

const ITEMS = [
  { href: "/today", label: "Vandaag", icon: "📋" },
  { href: "/upcoming-days", label: "Dagen", labelLong: "Komende dagen", icon: "🗓️" },
  { href: "/planning", label: "Planning", icon: "📅" },
  { href: "/customers", label: "Klanten", icon: "👥" },
  { href: "/invoices", label: "Facturen", icon: "🧾" },
  // Admin-only features, not a frequent field-use flow — kept out of the
  // mobile bottom tabs (already 6 items) to avoid crowding; see useVisibleItems.
  { href: "/users", label: "Gebruikers", icon: "🧑‍🤝‍🧑", desktopOnly: true, adminOnly: true },
  { href: "/audit-log", label: "Audittrail", icon: "📜", desktopOnly: true, adminOnly: true },
  { href: "/settings", label: "Meer", labelLong: "Instellingen", icon: "⚙️" },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Filters ITEMS by the current user's role (adminOnly) and, optionally, device (desktopOnly). */
function useVisibleItems(includeDesktopOnly: boolean) {
  const { data } = useCurrentUser();
  const isAdmin = data?.user?.role === "ADMIN";
  return ITEMS.filter((item) => {
    if ("adminOnly" in item && item.adminOnly && !isAdmin) return false;
    if (!includeDesktopOnly && "desktopOnly" in item && item.desktopOnly) return false;
    return true;
  });
}

export function SidebarNav() {
  const isActive = useIsActive();
  const router = useRouter();
  const items = useVisibleItems(true);

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
        {items.map((item) => (
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
  const items = useVisibleItems(false);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => (
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
