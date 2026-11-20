"use client";

import { useMutation } from "@tanstack/react-query";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HoursStepper } from "@/components/hours-stepper";
import { SendToEfButton } from "@/components/invoice-detail";
import type { TodoDetail } from "@/components/planning/planning-dialogs";
import { Button, ErrorNote, StatusBadge } from "@/components/ui";
import { apiSend } from "@/lib/api-client";
import { closeJobCheck } from "@/lib/registration";
import type { TodoRegistrationDto } from "@/lib/schemas/todos";
import { adHocBlockMinutes, registerHref } from "@/lib/register-link";
import { formatDateShort, formatTime, ZONE } from "@/lib/time";
import { todoStatusActions } from "@/lib/todo-list";

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const hours = (h: number) => `${String(h).replace(".", ",")} u`;

interface CloseResult {
  invoiced: boolean;
  totalInclVat?: number;
  efPush?: { ok: boolean; skipped?: boolean; message?: string; error?: string };
}

/**
 * Below the todo editor in the Todo's overview: status, the blocks, what was
 * registered per day (invoiced hours still editable while the day is not in
 * EenvoudigFactureren), the invoices of the todo with a send button, and the
 * actions that are allowed (close with/without invoice, cancel, reopen, delete).
 */
export function TodoDetailExtra({
  todo,
  onChanged,
  onDeleted,
}: {
  todo: TodoDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const actions = todoStatusActions(todo.status, todo.appointments);
  const blocks = [...todo.appointments].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const registrations = todo.registrations ?? [];
  const closeInput = {
    status: todo.status,
    hasCustomer: todo.customerId !== null,
    plannedBlocks: todo.appointments.filter((a) => a.status === "PLANNED").length,
    registeredDays: registrations.length,
    uninvoicedDays: registrations.filter((r) => r.invoice === null).length,
    hasBillable: registrations.some(
      (r) => r.invoice === null && (r.labor.some((l) => l.invoicedHours > 0) || r.extras.length > 0),
    ),
  };
  const canInvoice = closeJobCheck(closeInput, true).allowed;
  const canCloseOnly = closeJobCheck(closeInput, false).allowed;
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);
  const router = useRouter();
  // Registering (same wizard as the Dagplanning): customer todos only, never closed ones.
  const registrable = todo.customerId !== null && (todo.status === "OPEN" || todo.status === "PLANNED");
  const hasPlannedBlock = todo.appointments.some((a) => a.status === "PLANNED");
  // Unplanned work: first a block today (08:00), then the wizard.
  const adHocMutation = useMutation({
    mutationFn: () =>
      apiSend<{ id: number }>("/api/appointments", "POST", {
        todoId: todo.id,
        startAt: DateTime.now().setZone(ZONE).set({ hour: 8, minute: 0, second: 0, millisecond: 0 }).toISO(),
        durationMinutes: adHocBlockMinutes(todo.estimatedHours, todo.appointments),
      }),
    onSuccess: (block) => router.push(registerHref(block.id, { back: "/todos" })),
  });
  // Distinct invoices of this todo (a multi-day job usually has one).
  const invoices = [
    ...new Map(registrations.flatMap((r) => (r.invoice ? [[r.invoice.id, r.invoice] as const] : []))).values(),
  ];

  const statusMutation = useMutation({
    mutationFn: (status: "OPEN" | "CANCELLED") => apiSend(`/api/todos/${todo.id}`, "PATCH", { status }),
    onSuccess: onChanged,
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiSend(`/api/todos/${todo.id}`, "DELETE"),
    onSuccess: onDeleted,
  });
  const closeMutation = useMutation({
    mutationFn: (invoice: boolean) => apiSend<CloseResult>(`/api/todos/${todo.id}/close`, "POST", { invoice }),
    onSuccess: (r) => {
      setCloseResult(r);
      onChanged();
    },
  });
  const actionError = statusMutation.error ?? deleteMutation.error ?? closeMutation.error;
  const busy = statusMutation.isPending || deleteMutation.isPending || closeMutation.isPending;
  const anyAction = actions.canCancel || actions.canReopen || actions.canDelete || canInvoice || canCloseOnly;

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Status:</span>
        <StatusBadge status={todo.status} />
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-700">Blokken ({blocks.length})</h3>
        {blocks.length === 0 ? (
          <p className="text-xs text-gray-500">Nog niet ingepland. Inplannen doe je in de Planning.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
            {blocks.map((b) => {
              const end = new Date(new Date(b.startAt).getTime() + b.durationMinutes * 60000);
              return (
                <li
                  key={b.id}
                  className={`flex items-center justify-between gap-2 px-2 py-1 ${
                    b.status === "CANCELLED" ? "text-gray-400 line-through" : ""
                  }`}
                >
                  <span className="tabular-nums">
                    {formatDateShort(b.startAt)} {formatTime(b.startAt)}–{formatTime(end)}
                  </span>
                  <span className="flex items-center gap-2">
                    {registrable && b.status === "PLANNED" && (
                      <Link
                        href={registerHref(b.id, { back: "/todos" })}
                        className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-brand-700"
                      >
                        ✓ Klaarmelden
                      </Link>
                    )}
                    <StatusBadge status={b.status} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {registrable && !hasPlannedBlock && (
        <div className="rounded-md bg-gray-50 px-3 py-2">
          <Button className="w-full py-2.5" disabled={adHocMutation.isPending} onClick={() => adHocMutation.mutate()}>
            {adHocMutation.isPending ? "Bezig…" : "✓ Klaarmelden (vandaag)"}
          </Button>
          <p className="mt-1 text-xs text-gray-500">
            Er staat geen blok gepland: er wordt een blok voor vandaag aangemaakt, daarna geef je de uren in zoals in
            de Dagplanning.
          </p>
          {adHocMutation.error && <ErrorNote message={(adHocMutation.error as Error).message} />}
        </div>
      )}

      {registrations.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-gray-700">Geregistreerd ({registrations.length})</h3>
          <ul className="space-y-2">
            {registrations.map((r) => (
              <RegistrationCard key={r.completionId} todoId={todo.id} registration={r} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}

      {invoices.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-gray-700">Factuur</h3>
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="rounded-md border border-gray-200 px-2 py-1.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href="/invoices" className="text-gray-700 hover:underline">
                    {euro.format(inv.totalExclVat)} excl. btw
                  </Link>
                  <StatusBadge status={inv.syncExcluded ? "EXCLUDED" : inv.pushStatus} />
                </div>
                {!inv.efInvoiceId && (
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <SendToEfButton
                      invoice={{ ...inv, customerIsDemo: todo.customerIsDemo }}
                      onSent={() => {
                        setCloseResult(null);
                        onChanged();
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {closeResult && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            closeResult.efPush && !closeResult.efPush.ok && !closeResult.efPush.skipped
              ? "bg-amber-50 text-amber-900"
              : "bg-green-50 text-green-800"
          }`}
        >
          {closeResult.invoiced
            ? `Factuur aangemaakt (${euro.format(closeResult.totalInclVat ?? 0)} incl. btw). ${
                closeResult.efPush?.ok
                  ? "Concept staat in EenvoudigFactureren ✓"
                  : closeResult.efPush?.skipped
                    ? closeResult.efPush.message
                    : `⚠ Push naar EenvoudigFactureren mislukt: ${closeResult.efPush?.error ?? ""} — opnieuw proberen via Facturen.`
              }`
            : "Job afgesloten zonder factuur."}
        </p>
      )}

      {actionError && <ErrorNote message={(actionError as Error).message} />}
      {anyAction && (
        <div className="flex flex-wrap gap-2">
          {canInvoice && (
            <Button disabled={busy} onClick={() => closeMutation.mutate(true)}>
              🧾 {todo.status === "DONE" ? "Nu factureren" : "Factureren en afsluiten"}
            </Button>
          )}
          {canCloseOnly && (
            <Button variant="secondary" disabled={busy} onClick={() => closeMutation.mutate(false)}>
              ✓ Afsluiten zonder factuur
            </Button>
          )}
          {actions.canReopen && (
            <Button variant="secondary" disabled={busy} onClick={() => statusMutation.mutate("OPEN")}>
              ↺ Heropenen
            </Button>
          )}
          {actions.canCancel && (
            <Button variant="secondary" disabled={busy} onClick={() => statusMutation.mutate("CANCELLED")}>
              Annuleren
            </Button>
          )}
          {actions.canDelete && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Todo "${todo.title}" definitief verwijderen?`)) deleteMutation.mutate();
              }}
            >
              🗑 Verwijderen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One registered day: hours per resource (worked / invoiced), articles, remark,
 * invoice state. While the day is not in EF (no invoice, or one that is still
 * editable) the invoiced hours can be changed; an existing invoice is rebuilt.
 */
function RegistrationCard({
  todoId,
  registration: r,
  onChanged,
}: {
  todoId: number;
  registration: TodoRegistrationDto;
  onChanged: () => void;
}) {
  const editable = r.invoice === null || r.invoice.editable;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const saveMutation = useMutation({
    mutationFn: () =>
      apiSend(`/api/todos/${todoId}/invoiced-hours`, "PATCH", {
        entries: r.labor
          .filter((l) => draft[l.id] !== undefined && draft[l.id] !== l.invoicedHours)
          .map((l) => ({ laborEntryId: l.id, invoicedHours: draft[l.id] })),
      }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });
  const changed = r.labor.some((l) => draft[l.id] !== undefined && draft[l.id] !== l.invoicedHours);

  return (
    <li className="rounded-md border border-gray-200 px-2 py-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">{formatDateShort(r.date)}</span>
        {r.invoice ? (
          <span className="flex items-center gap-1 text-xs text-gray-600">
            Op factuur <StatusBadge status={r.invoice.pushStatus} />
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Nog niet gefactureerd
          </span>
        )}
      </div>
      <ul className="mt-1 text-gray-700">
        {r.labor.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-0.5">
            <span>
              {l.type === "PERSON" ? "👷" : "🚜"} {l.name}
            </span>
            {editing ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{hours(l.registeredHours)} gewerkt · factureren:</span>
                <HoursStepper
                  value={draft[l.id] ?? l.invoicedHours}
                  onChange={(h) => setDraft((d) => ({ ...d, [l.id]: h }))}
                  label={`Te factureren ${l.name}`}
                />
              </span>
            ) : (
              <span className="tabular-nums text-gray-600">
                {hours(l.registeredHours)} gewerkt · {hours(l.invoicedHours)} gefactureerd
              </span>
            )}
          </li>
        ))}
        {r.extras.map((e, i) => (
          <li key={`x${i}`} className="flex justify-between gap-2">
            <span>📦 {e.description}</span>
            <span className="tabular-nums text-gray-600">
              {String(e.quantity).replace(".", ",")} {e.unit} × {euro.format(e.unitPrice)}
            </span>
          </li>
        ))}
      </ul>
      {r.note && <p className="mt-1 text-xs italic text-gray-500">{r.note}</p>}

      {editable && r.labor.length > 0 && !editing && (
        <button
          type="button"
          onClick={() => {
            setDraft({});
            setEditing(true);
          }}
          className="mt-1 min-h-9 text-xs font-medium text-brand-700 hover:underline"
        >
          ✏️ Te factureren uren aanpassen
        </button>
      )}
      {editing && (
        <div className="mt-2 space-y-2">
          {r.invoice && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              De factuur wordt opnieuw opgebouwd met deze uren (opmerkingen en notities blijven behouden).
            </p>
          )}
          {saveMutation.error && <ErrorNote message={(saveMutation.error as Error).message} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Annuleren
            </Button>
            <Button type="button" disabled={!changed || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Bezig…" : "Uren bewaren"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
