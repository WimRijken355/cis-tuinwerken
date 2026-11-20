"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { TodoDetail } from "@/components/planning/planning-dialogs";
import { Button, ErrorNote, StatusBadge } from "@/components/ui";
import { apiSend } from "@/lib/api-client";
import { closeJobCheck } from "@/lib/registration";
import type { TodoRegistrationDto } from "@/lib/schemas/todos";
import { formatDateShort, formatTime } from "@/lib/time";
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
 * registered per day, and the actions that are allowed (close with/without
 * invoice, cancel, reopen, delete).
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
                  <StatusBadge status={b.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {registrations.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-gray-700">Geregistreerd ({registrations.length})</h3>
          <ul className="space-y-2">
            {registrations.map((r) => (
              <RegistrationCard key={r.completionId} registration={r} />
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

/** One registered day: hours per resource (worked / invoiced), articles, remark, invoice state. */
function RegistrationCard({ registration: r }: { registration: TodoRegistrationDto }) {
  return (
    <li className="rounded-md border border-gray-200 px-2 py-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">{formatDateShort(r.date)}</span>
        {r.invoice ? (
          <Link href="/invoices" className="flex items-center gap-1 text-xs text-gray-600 hover:underline">
            Factuur {euro.format(r.invoice.totalExclVat)} excl. <StatusBadge status={r.invoice.pushStatus} />
          </Link>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Nog niet gefactureerd
          </span>
        )}
      </div>
      <ul className="mt-1 text-gray-700">
        {r.labor.map((l, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span>
              {l.type === "PERSON" ? "👷" : "🚜"} {l.name}
            </span>
            <span className="tabular-nums text-gray-600">
              {hours(l.registeredHours)} gewerkt · {hours(l.invoicedHours)} gefactureerd
            </span>
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
    </li>
  );
}
