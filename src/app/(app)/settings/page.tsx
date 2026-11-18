"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Button,
  ErrorNote,
  Field,
  PageHeader,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import type { Settings } from "@/lib/schemas/settings";
import { APP_VERSION } from "@/lib/version";

interface SettingsResponse extends Settings {
  mailConfigured: boolean;
  efConfigured: boolean;
}

interface ImportReport {
  totalInEf: number;
  created: number;
  linked: number;
  skipped: number;
}

interface ReminderRunReport {
  candidates: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsResponse>("/api/settings"),
  });

  return (
    <div className="max-w-2xl p-4 md:p-8">
      <PageHeader title="Instellingen" />
      {isLoading && <Spinner />}
      {settings && (
        <div className="space-y-6">
          <RatesSection settings={settings} />
          <ProductsLinkSection />
          <WorkersSection />
          <ReminderSection settings={settings} />
          <EfImportSection efConfigured={settings.efConfigured} />
          <SecuritySection />
          <p className="pt-2 text-center text-xs text-gray-400">
            Tuinwerken Cis · versie {APP_VERSION}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Pointer to the separate products page. The sidebar has a menu item for it,
 * but the mobile bottom tabs do not, so this keeps it reachable on a phone.
 */
function ProductsLinkSection() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Artikels</h2>
      <p className="mt-1 text-sm text-gray-600">
        De prijslijst met extra&apos;s (machinegebruik, afvoer, ...) en de import
        uit EenvoudigFactureren staan nu op een aparte pagina.
      </p>
      <Link href="/products" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
        Artikels beheren →
      </Link>
    </section>
  );
}

/** Own hourly rate, VAT on labour and payment term. */
function RatesSection({ settings }: { settings: SettingsResponse }) {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(String(settings.ownHourlyRate));
  const [vat, setVat] = useState(String(settings.laborVatRate));
  const [daysDue, setDaysDue] = useState(String(settings.invoiceDaysDue));
  const [saved, setSaved] = useState(false);

  useEffect(() => setSaved(false), [rate, vat, daysDue]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiSend("/api/settings", "PUT", {
        ownHourlyRate: Number(rate.replace(",", ".")),
        laborVatRate: Number(vat),
        invoiceDaysDue: Number(daysDue),
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Tarieven</h2>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div className="w-40">
          <Field label="Eigen uurtarief (€)" hint="Excl. btw">
            <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Btw op arbeid" hint="6% kan bij woningen ouder dan 10 jaar">
            <select
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="21">21%</option>
              <option value="6">6%</option>
            </select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Betaaltermijn (dagen)">
            <TextInput inputMode="numeric" value={daysDue} onChange={(e) => setDaysDue(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Bezig…" : "Bewaren"}
        </Button>
        {saved && <span className="pb-2 text-sm text-green-700">✓</span>}
      </form>
      {saveMutation.error && (
        <div className="mt-2">
          <ErrorNote message={(saveMutation.error as Error).message} />
        </div>
      )}
    </section>
  );
}

interface WorkerItem {
  id: number;
  name: string;
  hourlyRate: number;
  active: boolean;
}

/** Regular workers (picklist in the registration flow). */
function WorkersSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  const { data: workers } = useQuery({
    queryKey: ["workers", "all"],
    queryFn: () => apiGet<WorkerItem[]>("/api/workers?includeInactive=1"),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["workers"] });

  const addMutation = useMutation({
    mutationFn: () =>
      apiSend("/api/workers", "POST", { name, hourlyRate: Number(rate.replace(",", ".")) }),
    onSuccess: () => {
      setName("");
      setRate("");
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (worker: WorkerItem) =>
      apiSend(`/api/workers/${worker.id}`, "PATCH", { active: !worker.active }),
    onSuccess: invalidate,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Medewerkers</h2>
      <p className="mt-1 text-sm text-gray-600">
        Werkmensen die je geregeld meeneemt. Hun uurtarief wordt bij elke
        registratie vastgeklikt, dus oude facturen veranderen nooit mee.
      </p>
      <ul className="mt-3 divide-y divide-gray-100">
        {workers?.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className={w.active ? "" : "text-gray-400 line-through"}>
              {w.name} — € {w.hourlyRate.toFixed(2)}/uur
            </span>
            <button
              type="button"
              className="text-xs text-brand-600 hover:underline"
              onClick={() => toggleMutation.mutate(w)}
            >
              {w.active ? "Deactiveren" : "Activeren"}
            </button>
          </li>
        ))}
      </ul>
      {addMutation.error && (
        <div className="mt-2">
          <ErrorNote message={(addMutation.error as Error).message} />
        </div>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
      >
        <div className="min-w-40 flex-1">
          <Field label="Naam">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
        </div>
        <div className="w-28">
          <Field label="€/uur">
            <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </Field>
        </div>
        <Button type="submit" disabled={addMutation.isPending}>
          + Toevoegen
        </Button>
      </form>
    </section>
  );
}

/** Uur + sjabloon van de herinneringsmail, en de handmatige testrun. */
function ReminderSection({ settings }: { settings: SettingsResponse }) {
  const queryClient = useQueryClient();
  const [hour, setHour] = useState(String(settings.reminderSendHour));
  const [subject, setSubject] = useState(settings.reminderEmailSubject);
  const [body, setBody] = useState(settings.reminderEmailBody);
  const [saved, setSaved] = useState(false);
  const [runReport, setRunReport] = useState<ReminderRunReport | null>(null);

  useEffect(() => setSaved(false), [hour, subject, body]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiSend("/api/settings", "PUT", {
        reminderSendHour: Number(hour),
        reminderEmailSubject: subject,
        reminderEmailBody: body,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const runMutation = useMutation({
    mutationFn: () => apiSend<ReminderRunReport>("/api/jobs/reminders", "POST"),
    onSuccess: setRunReport,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Herinneringsmail naar klanten</h2>
      <p className="mt-1 text-sm text-gray-600">
        Elke klant met een e-mailadres krijgt automatisch een herinnering op de
        dag vóór de afspraak, vanaf het gekozen uur.
      </p>
      {!settings.mailConfigured && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ SMTP is nog niet geconfigureerd (.env op de server). In development
          worden mails alleen naar de console gelogd; in productie faalt het
          versturen tot dit is ingevuld. Zie docs/jobs-en-mail.md.
        </p>
      )}

      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        {saveMutation.error && <ErrorNote message={(saveMutation.error as Error).message} />}
        <div className="w-40">
          <Field label="Verzenduur" hint="Tussen 16:00 en 21:00">
            <select
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {[16, 17, 18, 19, 20, 21].map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Onderwerp">
          <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </Field>
        <Field
          label="Bericht"
          hint="Placeholders: {{naam}} = klant, {{datum}} = dag, {{uur}} = startuur, {{werk}} = de todo"
        >
          <TextArea rows={7} value={body} onChange={(e) => setBody(e.target.value)} required />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Bezig…" : "Bewaren"}
          </Button>
          {saved && <span className="text-sm text-green-700">Bewaard ✓</span>}
        </div>
      </form>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <Button
          variant="secondary"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          {runMutation.isPending ? "Bezig…" : "Herinneringen voor morgen nu versturen"}
        </Button>
        {runMutation.error && (
          <div className="mt-2">
            <ErrorNote message={(runMutation.error as Error).message} />
          </div>
        )}
        {runReport && (
          <p className="mt-2 text-sm text-gray-600">
            {runReport.candidates} kandidaten · {runReport.sent} verstuurd ·{" "}
            {runReport.failed} mislukt · {runReport.skippedNoEmail} zonder e-mailadres
          </p>
        )}
      </div>
    </section>
  );
}

interface TrustedDevice {
  id: number;
  label: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

/** Re-run the 2FA setup and manage trusted devices. */
function SecuritySection() {
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const { data: devices } = useQuery({
    queryKey: ["trusted-devices"],
    queryFn: () => apiGet<TrustedDevice[]>("/api/auth/trusted-devices"),
  });

  const revokeMutation = useMutation({
    mutationFn: () => apiSend("/api/auth/trusted-devices", "DELETE"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["trusted-devices"] }),
  });

  const setupMutation = useMutation({
    mutationFn: () => apiSend<{ qrDataUrl: string }>("/api/auth/totp/setup", "POST"),
    onSuccess: (data) => {
      setQr(data.qrDataUrl);
      setRecoveryCodes(null);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiSend<{ recoveryCodes: string[] }>("/api/auth/totp/confirm", "POST", { code }),
    onSuccess: (data) => {
      setQr(null);
      setCode("");
      setRecoveryCodes(data.recoveryCodes);
      void queryClient.invalidateQueries({ queryKey: ["trusted-devices"] });
    },
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Beveiliging</h2>

      <h3 className="mt-3 text-sm font-medium text-gray-700">Vertrouwde toestellen</h3>
      {devices && devices.length === 0 && (
        <p className="mt-1 text-sm text-gray-500">Geen vertrouwde toestellen.</p>
      )}
      <ul className="mt-1 divide-y divide-gray-100 text-sm">
        {devices?.map((d) => (
          <li key={d.id} className="py-2">
            {d.label ?? "Onbekend toestel"}{" "}
            <span className="text-xs text-gray-400">
              · laatst gebruikt {new Date(d.lastUsedAt).toLocaleDateString("nl-BE")} · vervalt{" "}
              {new Date(d.expiresAt).toLocaleDateString("nl-BE")}
            </span>
          </li>
        ))}
      </ul>
      {(devices?.length ?? 0) > 0 && (
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => revokeMutation.mutate()}
          disabled={revokeMutation.isPending}
        >
          Alle vertrouwde toestellen intrekken
        </Button>
      )}

      <h3 className="mt-5 text-sm font-medium text-gray-700">Tweestapsverificatie</h3>
      <p className="mt-1 text-sm text-gray-500">
        Nieuwe telefoon of authenticator-app kwijt? Stel 2FA opnieuw in. Oude
        herstelcodes en vertrouwde toestellen vervallen daarbij.
      </p>
      {!qr && !recoveryCodes && (
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => setupMutation.mutate()}
          disabled={setupMutation.isPending}
        >
          2FA opnieuw instellen
        </Button>
      )}
      {qr && (
        <div className="mt-3 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR-code voor authenticator-app" />
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              confirmMutation.mutate();
            }}
          >
            <div className="w-40">
              <Field label="Code uit de app">
                <TextInput
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  required
                />
              </Field>
            </div>
            <Button type="submit" disabled={confirmMutation.isPending}>
              Bevestigen
            </Button>
            <Button type="button" variant="ghost" onClick={() => setQr(null)}>
              Annuleren
            </Button>
          </form>
          {confirmMutation.error && (
            <ErrorNote message={(confirmMutation.error as Error).message} />
          )}
        </div>
      )}
      {recoveryCodes && (
        <div className="mt-3 rounded-md bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Nieuwe herstelcodes — bewaar ze nu, ze worden maar één keer getoond:
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Import van bestaande klanten uit EenvoudigFactureren. */
function EfImportSection({ efConfigured }: { efConfigured: boolean }) {
  const [report, setReport] = useState<ImportReport | null>(null);

  const importMutation = useMutation({
    mutationFn: () => apiSend<ImportReport>("/api/customers/import-ef", "POST"),
    onSuccess: setReport,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">EenvoudigFactureren — klanten importeren</h2>
      <p className="mt-1 text-sm text-gray-600">
        Haalt je bestaande klanten op uit EenvoudigFactureren en koppelt ze aan
        deze app. Veilig om meermaals te draaien: er worden nooit duplicaten
        aangemaakt en je lokale gegevens blijven leidend.
      </p>
      {!efConfigured && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ Nog geen API-key geconfigureerd (EF_API_KEY in .env). Zie
          docs/integratie-eenvoudigfactureren.md.
        </p>
      )}
      <div className="mt-3">
        <Button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !efConfigured}
        >
          {importMutation.isPending ? "Bezig met importeren…" : "Importeer klanten uit EF"}
        </Button>
      </div>
      {importMutation.error && (
        <div className="mt-3">
          <ErrorNote message={(importMutation.error as Error).message} />
        </div>
      )}
      {report && (
        <div className="mt-3 rounded-md bg-brand-50 p-3 text-sm text-brand-900">
          <p className="font-medium">Import klaar ✔</p>
          <ul className="mt-1 list-inside list-disc">
            <li>{report.totalInEf} klanten gevonden in EenvoudigFactureren</li>
            <li>{report.created} nieuw aangemaakt</li>
            <li>{report.linked} gekoppeld aan bestaande klanten</li>
            <li>{report.skipped} overgeslagen (al gekoppeld)</li>
          </ul>
        </div>
      )}
    </section>
  );
}
