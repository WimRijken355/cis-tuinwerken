/**
 * Single source of truth for the app navigation (sidebar, bottom tabs and
 * the settings sub-navigation). Kept free of React so it can be unit tested.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Longer label for the desktop sidebar (falls back to `label`). */
  labelLong?: string;
  icon: string;
  /** Only shown in the desktop sidebar, not in the mobile bottom tabs. */
  desktopOnly?: boolean;
  /** Only shown to users with role ADMIN. */
  adminOnly?: boolean;
}

/** Page opened at startup ("/") and after logging in — on every device. */
export const START_PATH = "/daily-planning";

/** Main menu items (top level). */
export const MAIN_ITEMS: NavItem[] = [
  // Mostly used on a phone (see CLAUDE.md): one day at a time, ‹ › to browse.
  { href: "/daily-planning", label: "Dag", labelLong: "Dagplanning", icon: "📋" },
  { href: "/planning", label: "Planning", icon: "📅" },
  { href: "/customers", label: "Klanten", icon: "👥" },
  { href: "/invoices", label: "Facturen", icon: "🧾" },
  { href: "/dashboard", label: "Dashboard", icon: "📊", desktopOnly: true },
  // Admin-only, not a field-use flow — kept out of the mobile bottom tabs.
  { href: "/audit-log", label: "Audittrail", icon: "📜", desktopOnly: true, adminOnly: true },
];

/**
 * Everything that configures the app, grouped under "Instellingen": a
 * collapsible group in the sidebar, tabs on top of these pages on mobile
 * (the bottom tabs only have room for the group itself, as "Meer").
 */
export const SETTINGS_ITEMS: NavItem[] = [
  { href: "/settings", label: "Algemeen", icon: "⚙️" },
  { href: "/products", label: "Artikels", icon: "📦" },
  { href: "/resources", label: "Resources", icon: "🛠️" },
  { href: "/checklist", label: "Checklist", icon: "☑️" },
  { href: "/loose-todo-presets", label: "Losse todo's", icon: "📌" },
  { href: "/users", label: "Gebruikers", icon: "🧑‍🤝‍🧑", adminOnly: true },
];

export const SETTINGS_GROUP = { label: "Instellingen", shortLabel: "Meer", icon: "⚙️" };

/** Is `href` the current page (or a parent of it)? */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Is the current page one of the settings pages? */
export function isSettingsPath(pathname: string): boolean {
  return SETTINGS_ITEMS.some((item) => isActivePath(pathname, item.href));
}

/** Items visible for this role (and device, when `includeDesktopOnly` is false). */
export function visibleItems(items: NavItem[], isAdmin: boolean, includeDesktopOnly = true): NavItem[] {
  return items.filter((item) => (isAdmin || !item.adminOnly) && (includeDesktopOnly || !item.desktopOnly));
}
