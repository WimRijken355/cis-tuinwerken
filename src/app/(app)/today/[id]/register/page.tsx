"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Spinner, TextInput } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import type { PriceListItemDto, WorkerDto } from "@/lib/schemas/catalog";
import type { CompletionInput } from "@/lib/schemas/completions";
import { formatTime } from "@/lib/time";

/**
 * Registratieflow na het werk, in 4 stappen (duimvriendelijk):
 * 1. eigen uren  2. medewerkers  3. extra's  4. overzicht + bevestigen
 * Bij bevestigen wordt lokaal alles geregistreerd en automatisch een
 * conceptfactuur in EenvoudigFactureren aangemaakt.
 */

interface WorkerLine {
  name: string;
  hours: string;
  hourlyRate: string;
}

interface ExtraLine {
  priceListItemId?: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: number;
}

interface CompleteResult {
  completed: boolean;
  invoiceId: number;
  totalExclVat: number;
  efPush: { ok: boolean; efInvoiceId?: number; error?: string };
}

const parseNum = (v: string) => Number(v.replace(",", "."));

export default function RegisterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState(0);

  const { data: appointment, isLoading } = useQuery({
    queryKey: ["appointment", id],
    queryFn: () => apiGet<AppointmentDto>(`/api/appointments/${id}`),
  });
  const { data: workers } = useQuery({
    queryKey: ["workers"],
    queryFn: () => apiGet<WorkerDto[]>("/api/workers"),
  });
  const { data: priceList } = useQuery({
    queryKey: ["price-list"],
    queryFn: () => apiGet<PriceListItemDto[]>("/api/price-list"),
  });

  const [ownHours, setOwnHours] = useState<string | null>(null);
  const [workerLines, setWorkerLines] = useState<WorkerLine[]>([]);
  const [extraLines, setExtraLines] = useState<ExtraLine[]>([]);
  const [result, setResult] = useState<CompleteResult | null>(null);

  const completeMutation = useMutation({
    mutationFn: () => {
      const input: CompletionInput = {
        ownHours: parseNum(ownHours ?? "0"),
        workers: workerLines
          .filter((w) => w.name.trim() && parseNum(w.hours) > 0)
          .map((w) => ({
            name: w.name.trim(),
            hours: parseNum(w.hours),
            hourlyRate: parseNum(w.hourlyRate),
          })),
        extras: extraLines
          .filter((e) => parseNum(e.quantity) > 0)
          .map((e) => ({
            priceListItemId: e.priceListItemId,
            description: e.description,
            quantity: parseNum(e.quantity),
            unit: e.unit,
            unitPrice: parseNum(e.unitPrice),
            vatRate: e.vatRate,
          })),
      };
      return apiSend<CompleteResult>(`/api/appointments/${id}/complete`, "POST", input);
    },
    onSuccess: setResult,
  });

  if (isLoading || !appointment) return <Spinner />;
  if (appointment.status !== "PLANNED" && !result) {
    return (
      <div className="p-4">
        <ErrorNote message="Deze afspraak is al afgerond of geannuleerd." />
        <Link href="/today" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          ← Terug naar Vandaag
        </Link>
      </div>
    );
  }

  const hours = ownHours ?? String(appointment.estimatedHours);

  // --- Resultaatscherm -------------------------------------------------------
  if (result) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <div className="text-4xl">✅</div>
          <h1 className="mt-2 text-xl font-bold">Werk geregistreerd</h1>
          <p className="mt-1 text-gray-600">
            {appointment.customerName} · € {result.totalExclVat.toFixed(2)} excl. btw
          </p>
          {result.efPush.ok ? (
            <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              Conceptfactuur aangemaakt in EenvoudigFactureren ✓<br />
              Kijk ze daar na en maak ze definitief.
            </p>
          ) : (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠ De factuurpush naar EenvoudigFactureren is niet gelukt:{" "}
              {result.efPush.error}
              <br />
              Je registratie is wél bewaard — probeer het later opnieuw via Facturen.
            </p>
          )}
          <Button className="mt-4 w-full" onClick={() => router.replace("/today")}>
            Naar Vandaag
          </Button>
        </div>
      </div>
    );
  }

  // --- Stepper ---------------------------------------------------------------
  const steps = ["Uren", "Medewerkers", "Extra's", "Overzicht"];

  return (
    <div className="mx-auto max-w-lg p-4">
      <Link href="/today" className="text-sm text-brand-600 hover:underline">
        ← Vandaag
      </Link>
      <h1 className="mt-1 text-xl font-bold text-brand-900">{appointment.todoTitle}</h1>
      <p className="text-sm text-gray-500">
        {appointment.customerName} · {formatTime(appointment.startAt)}
      </p>

      {/* Stappenbalk */}
      <div className="my-4 flex gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 text-center">
            <div className={`h-1.5 rounded ${i <= step ? "bg-brand-600" : "bg-gray-200"}`} />
            <span className={`text-[11px] ${i === step ? "font-semibold text-brand-700" : "text-gray-400"}`}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {completeMutation.error && (
        <div className="mb-3">
          <ErrorNote message={(completeMutation.error as Error).message} />
        </div>
      )}

      {step === 0 && (
        <StepCard title="Hoeveel uur heb jij gewerkt?">
          <HoursInput value={hours} onChange={setOwnHours} />
          <p className="mt-2 text-xs text-gray-400">Geschat: ± {appointment.estimatedHours} uur</p>
          <NavButtons onNext={() => setStep(1)} nextDisabled={parseNum(hours) <= 0} />
        </StepCard>
      )}

      {step === 1 && (
        <StepCard title="Werkmensen meegenomen?">
          {(workers ?? []).map((w) => {
            const line = workerLines.find((l) => l.name === w.name);
            return (
              <div key={w.id} className="flex items-center gap-3 border-b border-gray-100 py-2">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(line)}
                    onChange={(e) =>
                      setWorkerLines((lines) =>
                        e.target.checked
                          ? [...lines, { name: w.name, hours, hourlyRate: String(w.hourlyRate) }]
                          : lines.filter((l) => l.name !== w.name),
                      )
                    }
                  />
                  <span>
                    {w.name}
                    <span className="ml-1 text-xs text-gray-400">€{w.hourlyRate}/u</span>
                  </span>
                </label>
                {line && (
                  <div className="w-24">
                    <TextInput
                      inputMode="decimal"
                      value={line.hours}
                      onChange={(e) =>
                        setWorkerLines((lines) =>
                          lines.map((l) => (l.name === w.name ? { ...l, hours: e.target.value } : l)),
                        )
                      }
                      placeholder="uren"
                    />
                  </div>
                )}
              </div>
            );
          })}
          <ExtraWorkerAdder onAdd={(l) => setWorkerLines((lines) => [...lines, l])} defaultHours={hours} />
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard title="Extra's aanrekenen?">
          {(priceList ?? []).map((p) => {
            const line = extraLines.find((l) => l.priceListItemId === p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 border-b border-gray-100 py-2">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(line)}
                    onChange={(e) =>
                      setExtraLines((lines) =>
                        e.target.checked
                          ? [
                              ...lines,
                              {
                                priceListItemId: p.id,
                                description: p.name,
                                quantity: "1",
                                unit: p.unit,
                                unitPrice: String(p.unitPrice),
                                vatRate: p.vatRate,
                              },
                            ]
                          : lines.filter((l) => l.priceListItemId !== p.id),
                      )
                    }
                  />
                  <span>
                    {p.name}
                    <span className="ml-1 text-xs text-gray-400">
                      €{p.unitPrice}/{p.unit}
                    </span>
                  </span>
                </label>
                {line && (
                  <div className="w-24">
                    <TextInput
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        setExtraLines((lines) =>
                          lines.map((l) =>
                            l.priceListItemId === p.id ? { ...l, quantity: e.target.value } : l,
                          ),
                        )
                      }
                      placeholder={p.unit}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {(priceList ?? []).length === 0 && (
            <p className="text-sm text-gray-500">
              Geen prijslijst-items. Voeg ze toe via Instellingen.
            </p>
          )}
          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title="Overzicht">
          <ul className="divide-y divide-gray-100 text-sm">
            <li className="flex justify-between py-2">
              <span>Eigen uren</span>
              <span className="font-medium">{hours} u</span>
            </li>
            {workerLines.map((w) => (
              <li key={w.name} className="flex justify-between py-2">
                <span>
                  {w.name} <span className="text-xs text-gray-400">(€{w.hourlyRate}/u)</span>
                </span>
                <span className="font-medium">{w.hours} u</span>
              </li>
            ))}
            {extraLines.map((e, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{e.description}</span>
                <span className="font-medium">
                  {e.quantity} {e.unit} × €{e.unitPrice}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            Bij bevestigen wordt het werk afgevinkt en automatisch een
            <strong> conceptfactuur</strong> aangemaakt in EenvoudigFactureren.
          </p>
          <NavButtons
            onBack={() => setStep(2)}
            onNext={() => completeMutation.mutate()}
            nextLabel={completeMutation.isPending ? "Bezig…" : "✓ Bevestigen & factureren"}
            nextDisabled={completeMutation.isPending}
          />
        </StepCard>
      )}
    </div>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

/** Grote +/– stepper voor uren, met kwartierstappen. */
function HoursInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const num = parseNum(value) || 0;
  const setNum = (v: number) => onChange(String(Math.max(0.25, Math.round(v * 4) / 4)));
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => setNum(num - 0.25)}
        className="h-12 w-12 rounded-full bg-gray-100 text-xl font-bold hover:bg-gray-200"
      >
        −
      </button>
      <div className="w-24">
        <TextInput
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-center text-xl font-bold"
        />
      </div>
      <button
        type="button"
        onClick={() => setNum(num + 0.25)}
        className="h-12 w-12 rounded-full bg-gray-100 text-xl font-bold hover:bg-gray-200"
      >
        +
      </button>
    </div>
  );
}

/** Losse werkkracht toevoegen die niet in de vaste picklist staat. */
function ExtraWorkerAdder({
  onAdd,
  defaultHours,
}: {
  onAdd: (line: WorkerLine) => void;
  defaultHours: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("20");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-sm text-brand-600 hover:underline"
      >
        + Iemand anders toevoegen
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-end gap-2">
      <div className="flex-1">
        <TextInput placeholder="Naam" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="w-24">
        <TextInput
          placeholder="€/uur"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          if (name.trim()) {
            onAdd({ name: name.trim(), hours: defaultHours, hourlyRate: rate });
            setName("");
            setOpen(false);
          }
        }}
      >
        OK
      </Button>
    </div>
  );
}

function NavButtons({
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
    <div className="mt-4 flex gap-2">
      {onBack && (
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          ← Terug
        </Button>
      )}
      <Button type="button" onClick={onNext} disabled={nextDisabled} className="flex-[2]">
        {nextLabel}
      </Button>
    </div>
  );
}
