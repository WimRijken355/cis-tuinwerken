import { AppNavShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

/**
 * Shell voor alle beveiligde schermen. De middleware heeft de sessie al
 * gecontroleerd voor deze layout rendert.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppNavShell>{children}</AppNavShell>
    </Providers>
  );
}
