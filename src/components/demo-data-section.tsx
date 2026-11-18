"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth-client";
import { Button, ErrorNote, Toggle } from "./ui";

interface DemoStatus {
  active: boolean;
  customers: number;
  todos: number;
}

/**
 * Settings → Algemeen: switch the demo data on/off (ADMIN only). Same logic
 * as `npm run demo:on` / `demo:off` (src/lib/demo/demo-data.ts).
 */
export function DemoDataSection() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.user?.role === "ADMIN";
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["demo-data"],
    queryFn: () => apiGet<DemoStatus>("/api/demo-data"),
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: (on: boolean) => apiSend("/api/demo-data", on ? "POST" : "DELETE"),
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  if (!isAdmin) return null;
  const active = status?.active ?? false;

  return (
    <section className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Demodata</h2>
          <p className="mt-1 text-sm text-gray-600">
            Fictieve klanten met todo&apos;s van enkele uren tot 6 werkdagen, met de
            resources Cis (altijd), Wim en Ken en enkele machines — om de planning
            uit te proberen. Demoklanten gaan nooit naar EenvoudigFactureren en
            krijgen nooit mails.
          </p>
          {status && (
            <p className="mt-2 text-sm font-medium text-gray-700">
              {active
                ? `Actief: ${status.customers} demoklanten, ${status.todos} todo's.`
                : "Niet actief."}
            </p>
          )}
          {active && (
            <p className="mt-1 text-xs text-gray-500">
              Uitzetten verwijdert de demoklanten met álles wat eraan hangt (ook
              afspraken die je er intussen op plande). Cis, Wim, Ken en je eigen
              checklist blijven staan.
            </p>
          )}
        </div>
        <Toggle
          checked={active}
          label="Demodata"
          disabled={!status || mutation.isPending}
          onChange={(on) => {
            if (!on && !confirm("Demodata verwijderen, met alles wat eraan hangt?")) return;
            mutation.mutate(on);
          }}
        />
      </div>
      {mutation.isPending && <p className="mt-2 text-sm text-gray-500">Bezig…</p>}
      {mutation.error && (
        <div className="mt-2">
          <ErrorNote message={(mutation.error as Error).message} />
        </div>
      )}
      {active && (
        <Button variant="ghost" className="mt-1 px-0 text-xs" onClick={() => (window.location.href = "/customers")}>
          Naar de klanten →
        </Button>
      )}
    </section>
  );
}
