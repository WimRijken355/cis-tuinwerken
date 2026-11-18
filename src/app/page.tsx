"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Startpagina = alleen een wegwijzer:
 * smal scherm (telefoon) → /daily-planning, breed scherm (desktop) → /planning.
 * Alle schermen blijven op elk toestel bereikbaar via de navigatie.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const target = window.innerWidth < 768 ? "/daily-planning" : "/planning";
    router.replace(target);
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center text-sm text-gray-500">
      Laden…
    </main>
  );
}
