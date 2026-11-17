"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api-client";
import type { RoleValue } from "./schemas/users";

export interface CurrentUser {
  id: number;
  username: string;
  role: RoleValue;
  totpEnabledAt: string | null;
}

/**
 * Who am I, including role — used to show/hide ADMIN-only UI (menu items,
 * pages). The shared QueryClient dedupes this call across all components
 * that use the ["me"] query key.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<{ user: CurrentUser | null }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
}
