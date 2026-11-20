"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api-client";
import { workdayMinutesFrom } from "./planning";

/**
 * Max. length of one planned block in minutes, from Settings ("max. uren per
 * ingepland blok", default 10 h). Shares the ["settings"] query with the
 * settings page, so a change there applies right away.
 */
export function useWorkdayMinutes(): number {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<{ maxBlockHours?: number }>("/api/settings"),
    staleTime: 60_000,
  });
  return workdayMinutesFrom(data?.maxBlockHours);
}
