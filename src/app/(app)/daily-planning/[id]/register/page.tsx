"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { HoursStepper } from "@/components/hours-stepper";
import { VatTotals } from "@/components/vat-totals";
import { vatSummary } from "@/lib/invoice-content";
import { TodoForm, type TodoFormValues } from "@/components/todo-form";
import { Button, ErrorNote, Spinner, TextArea, TextInput, Toggle } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatMinutesAsHours } from "@/lib/planning";
import { buildJobInvoice, ceilToQuarterHour, hoursFromTimeRange, searchArticles } from "@/lib/registration";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import type { PriceListItemDto } from "@/lib/schemas/catalog";
import type { ChecklistItemDto } from "@/lib/schemas/checklist";
import type { CompletionInput, RegistrationContextDto } from "@/lib/schemas/completions";
import type { ResourceDto } from "@/lib/schemas/resources";
import { formatTime, toBrussels } from "@/lib/time";

/**
 * "Klaarmelden" — registration after the work, built for a PHONE (see CLAUDE.md):
 * 1. Uren      planned resources with an hours proposal + extra people / machines;
 *              per resource registered AND invoiced hours (per started quarter)
 * 2. Artikels  optional extras from the price list
 * 3. Taken     planned checklist (tick what was done) + extra done tasks + note
 * 4. Factuur   "Nu factureren" (on for the last block of a job) with a preview
 *              of exactly what goes to EenvoudigFactureren
 * then:        a new todo for the same customer (with a preferred period).
 */

interface ResourceLine {
  resourceId: number;
  name: string;
  type: "PERSON" | "MACHINE";
  hourlyRate: number;
  planned: boolean;
  /** "HH:mm", default from the planned block; registeredHours follows these. */
  fromTime: string;
  toTime: string;
  registeredHours: number;
  invoicedHours: number;
  /** Invoiced hours follow the registered ones until changed by hand. */
  invoicedTouched: boolean;
  /** Planned info, e.g. "gepland 12 u · al 8 u geregistreerd". */
  info?: string;
  /** Planned but did not come along: kept visible (to undo), never registered. */
  absent?: boolean;
}

interface ExtraLine {
  priceListItemId: number;
  /** Name in the price list (to show/restore when the description is edited). */
  originalName: string;
  /** Text on the invoice; editable per registration. */
  description: string;
  /** As typed (comma allowed); both editable on site. */
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: number;
}

interface CompleteResult {
  completed: boolean;
  invoiced: boolean;
  /** The job (todo) was closed: invoiced, or finished without invoice. */
  closed?: boolean;
  nextBlocks?: number;
  invoiceId?: number;
  totalExclVat?: number;
  totalInclVat?: number;
  efPush?: { ok: boolean; skipped?: boolean; message?: string; efInvoiceId?: number; error?: string };
}

const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const hoursText = (h: number) => `${String(h).replace(".", ",")} u`;
const parseNum = (v: string) => Number(v.replace(",", "."));

export default function RegisterPage() {
  // useSearchParams needs a Suspense boundary (Next.js build requirement).
  return (
    <Suspense fallback={<Spinner />}>
      <Register />
    </Suspense>
  );
}

function Register() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const backHref = `/daily-planning${searchParams.get("date") ? `?date=${searchParams.get("date")}` : ""}`;

  const { data: appointment, isLoading } = useQuery({
    queryKey: ["appointment", id],
    queryFn: () => apiGet<AppointmentDto>(`/api/appointments/${id}`),
  });
  const { data: context } = useQuery({
    queryKey: ["registration", id],
    queryFn: () => apiGet<RegistrationContextDto>(`/api/appointments/${id}/registration`),
  });

  if (isLoading || !appointment || !context) return <Spinner />;
  if (appointment.isLoose) {
    return <Blocked backHref={backHref} message="Een losse todo wordt niet geregistreerd of gefactureerd." />;
  }
  if (appointment.status !== "PLANNED") {
    return <Blocked backHref={backHref} message="Deze afspraak is al geregistreerd of geannuleerd." />;
  }
  return <RegisterFlow appointment={appointment} context={context} backHref={backHref} />;
}

function Blocked({ backHref, message }: { backHref: string; message: string }) {
  return (
    <div className="p-4">
      <ErrorNote message={message} />
      <Link href={backHref} className="mt-3 inline-block text-sm text-brand-600 hover:underline">
        ← Terug naar de dagplanning
      </Link>
    </div>
  );
}

function RegisterFlow({
  appointment,
  context,
  backHref,
}: {
  appointment: AppointmentDto;
  context: RegistrationContextDto;
  backHref: string;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const blockHours = ceilToQuarterHour(context.blockMinutes / 60);

  // --- Step 1: resources --------------------------------------------------------
  // Default "van/tot" per resource comes from the planned block, starting at
  // the appointment's start time and running for its (capped) proposed hours.
  const blockStart = formatTime(appointment.startAt);
  const timeAfter = (hours: number) => toBrussels(appointment.startAt).plus({ hours }).toFormat("HH:mm");
  const [lines, setLines] = useState<ResourceLine[]>(() =>
    context.plannedResources.map((r) => ({
      resourceId: r.resourceId,
      name: r.name,
      type: r.type,
      hourlyRate: r.hourlyRate,
      planned: true,
      fromTime: blockStart,
      toTime: timeAfter(r.proposedHours),
      registeredHours: r.proposedHours,
      invoicedHours: r.proposedHours,
      invoicedTouched: false,
      info: `gepland ${hoursText(r.todoHours)} op deze job${
        r.alreadyRegisteredHours > 0 ? ` · al ${hoursText(r.alreadyRegisteredHours)} geregistreerd` : ""
      }`,
    })),
  );
  const { data: allResources } = useQuery({
    queryKey: ["resources", "active"],
    queryFn: () => apiGet<ResourceDto[]>("/api/resources"),
  });
  function updateLine(resourceId: number, patch: Partial<ResourceLine>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.resourceId !== resourceId) return l;
        const next = { ...l, ...patch };
        // The time range drives the registered hours; invoiced follows those
        // until changed by hand.
        if (patch.fromTime !== undefined || patch.toTime !== undefined) {
          next.registeredHours = hoursFromTimeRange(next.fromTime, next.toTime);
        }
        if (next.registeredHours !== l.registeredHours && !l.invoicedTouched) next.invoicedHours = next.registeredHours;
        return next;
      }),
    );
  }
  function addResource(resource: ResourceDto) {
    setLines((ls) => [
      ...ls,
      {
        resourceId: resource.id,
        name: resource.name,
        type: resource.type,
        hourlyRate: resource.hourlyRate,
        planned: false,
        fromTime: blockStart,
        toTime: timeAfter(blockHours),
        registeredHours: blockHours,
        invoicedHours: blockHours,
        invoicedTouched: false,
      },
    ]);
  }
  // Resources that actually came along (planned ones marked "niet mee" are left out).
  const activeLines = lines.filter((l) => !l.absent);
  const hasHours = activeLines.some((l) => l.registeredHours > 0 || l.invoicedHours > 0);

  // --- Step 2: artikels -----------------------------------------------------------
  const { data: priceList } = useQuery({
    queryKey: ["price-list"],
    queryFn: () => apiGet<PriceListItemDto[]>("/api/price-list"),
  });
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [articleSearch, setArticleSearch] = useState("");
  const articleResults = searchArticles(
    priceList ?? [],
    articleSearch,
    new Set(extras.map((e) => e.priceListItemId)),
  );
  function addArticle(p: PriceListItemDto) {
    setExtras((list) => [
      ...list,
      {
        priceListItemId: p.id,
        originalName: p.name,
        description: p.name,
        quantity: "1",
        unit: p.unit,
        unitPrice: String(p.unitPrice).replace(".", ","),
        vatRate: p.vatRate,
      },
    ]);
    setArticleSearch("");
  }
  const updateArticle = (priceListItemId: number, patch: Partial<ExtraLine>) =>
    setExtras((list) => list.map((x) => (x.priceListItemId === priceListItemId ? { ...x, ...patch } : x)));

  // --- Step 3: checklist + note ---------------------------------------------------
  const [taskDone, setTaskDone] = useState<Map<number, boolean>>(
    () => new Map(context.tasks.map((t) => [t.id, t.done])),
  );
  const [extraTasks, setExtraTasks] = useState<{ checklistItemId?: number; label: string }[]>([]);
  const [freeTask, setFreeTask] = useState("");
  const [note, setNote] = useState("");
  const { data: checklistItems } = useQuery({
    queryKey: ["checklist-items", "active"],
    queryFn: () => apiGet<ChecklistItemDto[]>("/api/checklist-items"),
  });
  const onTodoChecklist = new Set(context.tasks.map((t) => t.checklistItemId).filter((x) => x !== null));
  const extraCandidates = (checklistItems ?? []).filter((c) => !onTodoChecklist.has(c.id));

  // --- Step 4: invoice ------------------------------------------------------------
  // "Job afgewerkt" (close the todo) and "Nu factureren" are separate choices:
  // a finished job can also be closed without invoicing it now (jobOutcome).
  const [closeJob, setCloseJob] = useState(context.defaultInvoiceNow);
  const [invoiceWanted, setInvoiceWanted] = useState(true);
  const invoiceNow = closeJob && invoiceWanted;
  const todayDay = useMemo(
    () => ({
      date: appointment.startAt,
      labor: activeLines.map((l) => ({
        resourceId: l.resourceId,
        name: l.name,
        type: l.type,
        invoicedHours: l.invoicedHours,
        hourlyRate: l.hourlyRate,
        vatRate: context.laborVatRate,
      })),
      extras: extras
        .filter((e) => parseNum(e.quantity) > 0 && parseNum(e.unitPrice) >= 0)
        .map((e) => ({
          ...e,
          // An emptied description falls back to the article name.
          description: e.description.trim() || e.originalName,
          quantity: parseNum(e.quantity),
          unitPrice: parseNum(e.unitPrice),
        })),
    }),
    [appointment.startAt, activeLines, extras, context.laborVatRate],
  );
  // Remarks per invoice line (by line key) and extra note lines — both go to EF.
  const [lineRemarks, setLineRemarks] = useState<Record<string, string>>({});
  const [openRemark, setOpenRemark] = useState<string | null>(null);
  const [invoiceNotes, setInvoiceNotes] = useState<string[]>([]);
  const preview = useMemo(() => {
    try {
      return {
        ...buildJobInvoice({ days: [...context.uninvoicedDays, todayDay], remarks: lineRemarks, notes: invoiceNotes }),
        error: null as string | null,
      };
    } catch (e) {
      return { items: [], lines: [], notes: [], totalExclVat: 0, error: (e as Error).message };
    }
  }, [context.uninvoicedDays, todayDay, lineRemarks, invoiceNotes]);

  const [result, setResult] = useState<CompleteResult | null>(null);
  const completeMutation = useMutation({
    mutationFn: () => {
      const input: CompletionInput = {
        resources: activeLines
          .filter((l) => l.registeredHours > 0 || l.invoicedHours > 0)
          .map((l) => ({ resourceId: l.resourceId, registeredHours: l.registeredHours, invoicedHours: l.invoicedHours })),
        extras: todayDay.extras.map((e) => ({
          priceListItemId: e.priceListItemId,
          description: e.description,
          quantity: e.quantity,
          unit: e.unit,
          unitPrice: e.unitPrice,
          vatRate: e.vatRate,
        })),
        taskStates: [...taskDone.entries()].map(([taskId, done]) => ({ id: taskId, done })),
        extraTasks,
        note: note.trim() || undefined,
        invoiceNow,
        closeJob,
        lineRemarks: invoiceNow ? lineRemarks : {},
        invoiceNotes: invoiceNow ? invoiceNotes.map((n) => n.trim()).filter(Boolean) : [],
      };
      return apiSend<CompleteResult>(`/api/appointments/${appointment.id}/complete`, "POST", input);
    },
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  if (result) {
    return <ResultAndFollowUp appointment={appointment} result={result} backHref={backHref} />;
  }

  const steps = ["Uren", "Artikels", "Taken", "Factuur"];
  const plannedLines = lines.filter((l) => l.planned);
  const extraPeople = lines.filter((l) => !l.planned && l.type === "PERSON");
  const extraMachines = lines.filter((l) => !l.planned && l.type === "MACHINE");
  const doneTasks = context.tasks.filter((t) => taskDone.get(t.id));
  const notDoneTasks = context.tasks.filter((t) => !taskDone.get(t.id));

  return (
    <div className="mx-auto max-w-lg p-3 pb-6 sm:p-4">
      <Link href={backHref} className="text-sm text-brand-600 hover:underline">
        ← Dagplanning
      </Link>
      <h1 className="mt-1 text-lg font-bold leading-tight text-brand-900">{appointment.todoTitle}</h1>
      <p className="text-sm text-gray-500">
        {appointment.customerName} · {formatTime(appointment.startAt)} ({formatMinutesAsHours(appointment.durationMinutes)})
        {appointment.part.total > 1 && ` · dag ${appointment.part.index}/${appointment.part.total}`}
      </p>

      <div className="sticky top-0 z-10 -mx-3 my-3 flex gap-1 bg-gray-50/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        {steps.map((s, i) => (
          <button key={s} type="button" onClick={() => setStep(i)} className="flex-1 text-center">
            <div className={`h-1.5 rounded ${i <= step ? "bg-brand-600" : "bg-gray-200"}`} />
            <span className={`text-[11px] ${i === step ? "font-semibold text-brand-700" : "text-gray-400"}`}>{s}</span>
          </button>
        ))}
      </div>

      {completeMutation.error && (
        <div className="mb-3">
          <ErrorNote message={(completeMutation.error as Error).message} />
        </div>
      )}

      {step === 0 && (
        <div className="space-y-3">
          <Card title="Ingepland">
            {plannedLines.length === 0 && (
              <p className="text-sm text-gray-500">Er waren geen resources ingepland op deze todo.</p>
            )}
            {plannedLines.map((l) =>
              l.absent ? (
                <div
                  key={l.resourceId}
                  className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm last:border-0"
                >
                  <span className="text-gray-400 line-through">
                    {l.type === "PERSON" ? "👷" : "🚜"} {l.name}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">niet mee</span>
                    <button
                      type="button"
                      onClick={() => updateLine(l.resourceId, { absent: false })}
                      className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 active:bg-gray-50"
                    >
                      ↩ toch mee
                    </button>
                  </span>
                </div>
              ) : (
                <ResourceHours
                  key={l.resourceId}
                  line={l}
                  onChange={(patch) => updateLine(l.resourceId, patch)}
                  onRemove={() => updateLine(l.resourceId, { absent: true })}
                  removeLabel="niet mee"
                />
              ),
            )}
          </Card>
          <ExtraResourceCard
            title="👷 Extra personen"
            type="PERSON"
            lines={extraPeople}
            available={(allResources ?? []).filter((r) => r.type === "PERSON" && !lines.some((l) => l.resourceId === r.id))}
            onAdd={addResource}
            onChange={updateLine}
            onRemove={(rid) => setLines((ls) => ls.filter((l) => l.resourceId !== rid))}
          />
          <ExtraResourceCard
            title="🚜 Extra machines"
            type="MACHINE"
            lines={extraMachines}
            available={(allResources ?? []).filter((r) => r.type === "MACHINE" && !lines.some((l) => l.resourceId === r.id))}
            onAdd={addResource}
            onChange={updateLine}
            onRemove={(rid) => setLines((ls) => ls.filter((l) => l.resourceId !== rid))}
          />
          <p className="px-1 text-xs text-gray-400">
            Uren per begonnen kwartier. <strong>Geregistreerd</strong> = echt gewerkt (voor je overzicht),{" "}
            <strong>gefactureerd</strong> = wat de klant betaalt.
          </p>
          <Nav onNext={() => setStep(1)} nextDisabled={!hasHours} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {extras.length > 0 && (
            <Card title={`Gekozen artikels (${extras.length})`}>
              <ul className="divide-y divide-gray-100">
                {extras.map((x) => {
                  const lineTotal = parseNum(x.quantity) * parseNum(x.unitPrice);
                  return (
                    <li key={x.priceListItemId} className="py-2">
                      <div className="flex items-start justify-between gap-2">
                        <label className="block min-w-0 flex-1">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                            Omschrijving (op de factuur)
                          </span>
                          <TextInput
                            aria-label={`Omschrijving ${x.originalName}`}
                            value={x.description}
                            maxLength={200}
                            onChange={(e) => updateArticle(x.priceListItemId, { description: e.target.value })}
                            className="text-base"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setExtras((list) => list.filter((y) => y.priceListItemId !== x.priceListItemId))}
                          className="mt-5 shrink-0 rounded-md px-2 py-1 text-xs text-red-500 active:bg-red-50"
                        >
                          verwijderen
                        </button>
                      </div>
                      {x.description.trim() !== x.originalName && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          Artikel: {x.originalName} ·{" "}
                          <button
                            type="button"
                            className="text-brand-600"
                            onClick={() => updateArticle(x.priceListItemId, { description: x.originalName })}
                          >
                            ↩ origineel
                          </button>
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-end gap-2">
                        <label className="block">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                            Aantal ({x.unit})
                          </span>
                          <TextInput
                            inputMode="decimal"
                            aria-label={`Aantal ${x.description}`}
                            value={x.quantity}
                            onChange={(e) => updateArticle(x.priceListItemId, { quantity: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            className="!w-24 text-base"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                            Prijs/{x.unit} (€, excl. btw)
                          </span>
                          <TextInput
                            inputMode="decimal"
                            aria-label={`Prijs ${x.description}`}
                            value={x.unitPrice}
                            onChange={(e) => updateArticle(x.priceListItemId, { unitPrice: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            className="!w-28 text-base"
                          />
                        </label>
                        <span className="pb-2 text-sm text-gray-600">
                          = {Number.isFinite(lineTotal) ? euro.format(lineTotal) : "–"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title="Artikel toevoegen (optioneel)">
            <TextInput
              type="search"
              placeholder="Zoek op naam, bv. graszaad…"
              value={articleSearch}
              onChange={(e) => setArticleSearch(e.target.value)}
              className="text-base"
            />
            {(priceList ?? []).length === 0 && <p className="mt-2 text-sm text-gray-500">Geen artikels.</p>}
            <ul className="mt-1 divide-y divide-gray-100">
              {articleResults.results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addArticle(p)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm active:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{p.name}</span>
                      <span className="text-xs text-gray-400">
                        {euro.format(p.unitPrice)}/{p.unit} · {p.vatRate}% btw
                      </span>
                    </span>
                    <span className="shrink-0 text-lg text-brand-600">＋</span>
                  </button>
                </li>
              ))}
            </ul>
            {articleResults.more && (
              <p className="mt-1 text-xs text-gray-400">Meer artikels gevonden — typ verder om te verfijnen.</p>
            )}
            {articleSearch && articleResults.results.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">Geen artikels voor &quot;{articleSearch}&quot;.</p>
            )}
          </Card>
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Card title={`Geplande taken (${doneTasks.length}/${context.tasks.length} uitgevoerd)`}>
            {context.tasks.length === 0 && <p className="text-sm text-gray-500">Geen checklist op deze todo.</p>}
            <ul className="space-y-1">
              {context.tasks.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm active:bg-gray-50">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-brand-600"
                      checked={taskDone.get(t.id) ?? false}
                      onChange={(e) => setTaskDone((m) => new Map(m).set(t.id, e.target.checked))}
                    />
                    <span className={taskDone.get(t.id) ? "text-gray-500 line-through" : ""}>{t.label}</span>
                    {t.unplanned && <span className="text-[10px] text-gray-400">(extra)</span>}
                  </label>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Extra uitgevoerd (niet gepland)">
            {extraCandidates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {extraCandidates.map((c) => {
                  const on = extraTasks.some((x) => x.checklistItemId === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setExtraTasks((list) =>
                          on ? list.filter((x) => x.checklistItemId !== c.id) : [...list, { checklistItemId: c.id, label: c.name }],
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 text-gray-600"
                      }`}
                    >
                      {on ? "✓ " : "+ "}
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
            {extraTasks
              .filter((x) => x.checklistItemId === undefined)
              .map((x) => (
                <p key={x.label} className="mt-2 flex items-center justify-between text-sm">
                  <span>✓ {x.label}</span>
                  <button
                    type="button"
                    className="text-xs text-red-500"
                    onClick={() => setExtraTasks((list) => list.filter((y) => y !== x))}
                  >
                    weg
                  </button>
                </p>
              ))}
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (freeTask.trim()) {
                  setExtraTasks((list) => [...list, { label: freeTask.trim() }]);
                  setFreeTask("");
                }
              }}
            >
              <TextInput placeholder="Andere taak…" value={freeTask} onChange={(e) => setFreeTask(e.target.value)} />
              <Button type="submit" variant="secondary">
                +
              </Button>
            </form>
          </Card>
          <Card title="Notitie">
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bv. poort was op slot, klant belt nog terug…" />
          </Card>
          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Card title="Factuur">
            <label className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-medium">Job afgewerkt</span>
                <span className="block text-xs text-gray-500">
                  {context.defaultInvoiceNow
                    ? "Dit is de laatste geplande dag van deze job."
                    : context.otherPlannedBlocks > 0
                      ? `Er staan nog ${context.otherPlannedBlocks} geplande dag(en) voor deze job — de factuur volgt dan normaal bij de laatste.`
                      : `Er is nog ${formatMinutesAsHours(context.remainingUnplannedMinutes)} niet ingepland voor deze job.`}
                </span>
              </span>
              <Toggle checked={closeJob} onChange={setCloseJob} label="Job afgewerkt" />
            </label>
            {closeJob && (
              <label className="mt-3 flex items-start justify-between gap-3 border-t border-gray-100 pt-3">
                <span>
                  <span className="block font-medium">Nu factureren</span>
                  <span className="block text-xs text-gray-500">
                    {invoiceWanted
                      ? "Alle nog niet gefactureerde dagen van deze job komen op één factuur."
                      : "De job wordt afgesloten zonder factuur. Factureren kan later nog via Todo's → ✏️."}
                  </span>
                </span>
                <Toggle checked={invoiceWanted} onChange={setInvoiceWanted} label="Nu factureren" />
              </label>
            )}
            {!closeJob && (
              <p className="mt-2 text-xs text-gray-500">
                De todo blijft open voor een volgende dag; de factuur volgt wanneer de job afgewerkt is.
              </p>
            )}
            {closeJob && context.otherPlannedBlocks > 0 && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ De job wordt afgesloten: de {context.otherPlannedBlocks} nog geplande dag(en) worden uit de planning
                gehaald.
              </p>
            )}
          </Card>

          {invoiceNow ? (
            <Card title="Dit wordt gefactureerd">
              {preview.error ? (
                <ErrorNote message={preview.error} />
              ) : preview.lines.length === 0 ? (
                <p className="text-sm text-gray-500">Geen gefactureerde uren of artikels.</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {preview.lines.map((line) => {
                    const item = line.item;
                    const editing = openRemark === line.key;
                    return (
                      <li key={line.key} className="py-2">
                        <p className="font-medium leading-snug">{item.description}</p>
                        <p className="flex justify-between text-xs text-gray-500">
                          <span>
                            {String(item.quantity).replace(".", ",")} {item.unit} × {euro.format(item.amount ?? 0)} ·{" "}
                            {item.tax_rate}% btw
                          </span>
                          <span className="font-medium text-gray-800">
                            {euro.format((item.quantity ?? 0) * (item.amount ?? 0))}
                          </span>
                        </p>
                        {line.kind === "labor" && line.details.length > 0 && (
                          <p className="mt-0.5 text-[11px] text-gray-400" title="Enkel ter info — niet op de factuur">
                            ⓘ {line.details.map((d) => `${d.name} ${hoursText(d.hours)}`).join(" + ")}
                          </p>
                        )}
                        {editing ? (
                          <div className="mt-1.5 flex gap-2">
                            <TextInput
                              autoFocus
                              placeholder="Opmerking bij deze regel…"
                              value={lineRemarks[line.key] ?? ""}
                              maxLength={500}
                              onChange={(e) => setLineRemarks((r) => ({ ...r, [line.key]: e.target.value }))}
                              className="text-base"
                            />
                            <Button type="button" variant="secondary" onClick={() => setOpenRemark(null)}>
                              OK
                            </Button>
                          </div>
                        ) : line.remark ? (
                          <button
                            type="button"
                            onClick={() => setOpenRemark(line.key)}
                            className="mt-1 block w-full rounded bg-gray-50 px-2 py-1 text-left text-xs italic text-gray-700"
                          >
                            💬 {line.remark} <span className="not-italic text-brand-600">· wijzigen</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setOpenRemark(line.key)}
                            className="mt-1 py-1 text-xs text-brand-600"
                          >
                            + opmerking bij deze regel
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {preview.notes.map((n, i) => (
                    <li key={`note-${i}`} className="py-2 text-xs italic text-gray-600">
                      💬 {n}
                    </li>
                  ))}
                  <li className="pt-2">
                    <VatTotals summary={vatSummary(preview.items)} />
                  </li>
                </ul>
              )}
              <div className="mt-3 border-t border-gray-100 pt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Opmerkingsregels op de factuur</p>
                {invoiceNotes.map((n, i) => (
                  <div key={i} className="mt-1.5 flex gap-2">
                    <TextInput
                      value={n}
                      maxLength={1000}
                      placeholder="Opmerking…"
                      onChange={(e) => setInvoiceNotes((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                      className="text-base"
                    />
                    <button
                      type="button"
                      aria-label="Opmerkingsregel verwijderen"
                      onClick={() => setInvoiceNotes((list) => list.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-md px-2 text-red-500 active:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setInvoiceNotes((list) => [...list, ""])}
                  className="mt-1.5 py-1 text-sm text-brand-600"
                >
                  + Opmerkingsregel toevoegen
                </button>
                <p className="text-[11px] text-gray-400">
                  Opmerkingen komen als tekstregel op de factuur in EenvoudigFactureren. De ⓘ-opsplitsing per persoon
                  is enkel ter info.
                </p>
              </div>
              {context.uninvoicedDays.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  Inclusief {context.uninvoicedDays.length} eerder geregistreerde dag(en) van deze job.
                </p>
              )}
            </Card>
          ) : (
            <Card title="Vandaag geregistreerd">
              <ul className="divide-y divide-gray-100 text-sm">
                {activeLines
                  .filter((l) => l.registeredHours > 0 || l.invoicedHours > 0)
                  .map((l) => (
                    <li key={l.resourceId} className="flex justify-between py-1.5">
                      <span>
                        {l.type === "PERSON" ? "👷" : "🚜"} {l.name}
                      </span>
                      <span className="text-gray-600">
                        {hoursText(l.registeredHours)} · gefactureerd {hoursText(l.invoicedHours)}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-gray-400">
                {closeJob
                  ? "Uren worden bewaard en de job wordt afgesloten, zonder factuur."
                  : "Uren worden bewaard; de factuur volgt bij de laatste dag."}
              </p>
            </Card>
          )}

          <Card title="Checklist">
            <ul className="space-y-0.5 text-sm">
              {doneTasks.map((t) => (
                <li key={t.id} className="text-green-700">
                  ✓ {t.label}
                </li>
              ))}
              {notDoneTasks.map((t) => (
                <li key={t.id} className="text-red-600">
                  ✗ {t.label} <span className="text-xs text-gray-400">(gepland, niet uitgevoerd)</span>
                </li>
              ))}
              {extraTasks.map((t) => (
                <li key={t.label} className="text-blue-700">
                  + {t.label} <span className="text-xs text-gray-400">(extra)</span>
                </li>
              ))}
              {context.tasks.length + extraTasks.length === 0 && <li className="text-gray-500">Geen taken.</li>}
            </ul>
          </Card>

          <Nav
            onBack={() => setStep(2)}
            onNext={() => completeMutation.mutate()}
            nextLabel={
              completeMutation.isPending
                ? "Bezig…"
                : invoiceNow
                  ? "✓ Bevestigen & factureren"
                  : closeJob
                    ? "✓ Bewaren & afsluiten"
                    : "✓ Uren bewaren"
            }
            nextDisabled={completeMutation.isPending || !hasHours}
          />
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** One resource with its registered and invoiced hours. */
function ResourceHours({
  line,
  onChange,
  onRemove,
  removeLabel = "verwijderen",
}: {
  line: ResourceLine;
  onChange: (patch: Partial<ResourceLine>) => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="border-b border-gray-100 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">
          {line.type === "PERSON" ? "👷" : "🚜"} {line.name}
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md px-2 py-1 text-xs text-red-500 active:bg-red-50"
          >
            {removeLabel}
          </button>
        )}
      </div>
      {line.info && <p className="text-xs text-gray-400">{line.info}</p>}
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Gewerkt van – tot</p>
          <div className="flex items-center gap-1.5">
            <TextInput
              type="time"
              aria-label={`Van ${line.name}`}
              value={line.fromTime}
              onChange={(e) => onChange({ fromTime: e.target.value })}
              className="!w-[6.5rem] text-base"
            />
            <span className="text-gray-400">–</span>
            <TextInput
              type="time"
              aria-label={`Tot ${line.name}`}
              value={line.toTime}
              onChange={(e) => onChange({ toTime: e.target.value })}
              className="!w-[6.5rem] text-base"
            />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">= {hoursText(line.registeredHours)} geregistreerd</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Gefactureerd</p>
          <HoursStepper
            label={`Gefactureerd ${line.name}`}
            value={line.invoicedHours}
            onChange={(invoicedHours) => onChange({ invoicedHours, invoicedTouched: true })}
          />
        </div>
      </div>
    </div>
  );
}

function ExtraResourceCard({
  title,
  type,
  lines,
  available,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  type: "PERSON" | "MACHINE";
  lines: ResourceLine[];
  available: ResourceDto[];
  onAdd: (resource: ResourceDto) => void;
  onChange: (resourceId: number, patch: Partial<ResourceLine>) => void;
  onRemove: (resourceId: number) => void;
}) {
  return (
    <Card title={title}>
      {lines.map((l) => (
        <ResourceHours
          key={l.resourceId}
          line={l}
          onChange={(patch) => onChange(l.resourceId, patch)}
          onRemove={() => onRemove(l.resourceId)}
        />
      ))}
      {available.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            const resource = available.find((r) => r.id === Number(e.target.value));
            if (resource) onAdd(resource);
          }}
          className="mt-1 w-full rounded-md border border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-600"
        >
          <option value="">{type === "PERSON" ? "+ Persoon toevoegen…" : "+ Machine toevoegen…"}</option>
          {available.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : (
        lines.length === 0 && (
          <p className="text-sm text-gray-400">{type === "PERSON" ? "Geen andere personen." : "Geen andere machines."}</p>
        )
      )}
    </Card>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Volgende",
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-1">
      {onBack && (
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1 py-3">
          ← Terug
        </Button>
      )}
      <Button type="button" onClick={onNext} disabled={nextDisabled} className="flex-[2] py-3">
        {nextLabel}
      </Button>
    </div>
  );
}

/** Result + last step: a new todo for the same customer (with a preferred period). */
function ResultAndFollowUp({
  appointment,
  result,
  backHref,
}: {
  appointment: AppointmentDto;
  result: CompleteResult;
  backHref: string;
}) {
  const router = useRouter();
  const [created, setCreated] = useState(false);
  const createMutation = useMutation({
    mutationFn: (values: TodoFormValues) =>
      apiSend("/api/todos", "POST", { ...values, customerId: appointment.customerId }),
    onSuccess: () => setCreated(true),
  });

  return (
    <div className="mx-auto max-w-lg space-y-3 p-3 sm:p-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
        <div className="text-3xl">✅</div>
        <h1 className="mt-1 text-lg font-bold">{result.invoiced ? "Geregistreerd en gefactureerd" : result.closed ? "Geregistreerd en afgesloten" : "Uren bewaard"}</h1>
        <p className="mt-1 text-sm text-gray-600">{appointment.customerName}</p>
        {result.invoiced ? (
          <>
            <p className="text-sm text-gray-600">
              {euro.format(result.totalExclVat ?? 0)} excl. btw ·{" "}
              <strong>{euro.format(result.totalInclVat ?? 0)} incl. btw</strong>
            </p>
            {result.efPush?.skipped ? (
              <p className="mt-2 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
                {result.efPush.message || "De factuur is lokaal bewaard."}
              </p>
            ) : result.efPush?.ok ? (
              <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                Conceptfactuur aangemaakt in EenvoudigFactureren ✓
              </p>
            ) : (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ⚠ Push naar EenvoudigFactureren mislukt: {result.efPush?.error}. De registratie is wél bewaard — opnieuw
                proberen via Facturen.
              </p>
            )}
          </>
        ) : result.closed ? (
          <p className="mt-2 text-sm text-gray-600">
            De job is afgesloten zonder factuur. Factureren kan later nog via Todo&apos;s → ✏️.
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            {result.nextBlocks
              ? `Nog ${result.nextBlocks} geplande dag(en) voor deze job; de factuur volgt bij de laatste.`
              : "Er is nog geen volgende dag gepland voor deze job — plan het vervolg in via Planning."}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <h2 className="mb-2 font-semibold">Nieuwe todo voor {appointment.customerName}?</h2>
        {created ? (
          <p className="text-sm text-green-700">✓ Todo aangemaakt — hij staat bij &quot;In te plannen&quot;.</p>
        ) : (
          <TodoForm
            submitLabel="Todo aanmaken"
            busy={createMutation.isPending}
            error={createMutation.error ? (createMutation.error as Error).message : null}
            onSubmit={(values) => createMutation.mutate(values)}
            showPeriod
          />
        )}
      </section>

      <Button className="w-full py-3" onClick={() => router.replace(backHref)}>
        {created ? "Naar de dagplanning" : "Overslaan — naar de dagplanning"}
      </Button>
    </div>
  );
}
