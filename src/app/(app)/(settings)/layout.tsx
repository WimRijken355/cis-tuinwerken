import { SettingsSubnav } from "@/components/app-nav";

/**
 * Shared layout of the settings pages (route group, URLs unchanged):
 * Algemeen, Artikels, Resources, Checklist, Gebruikers. Adds the mobile tab
 * row to switch between them; on desktop the sidebar group does that.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsSubnav />
      {children}
    </>
  );
}
