"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorNote, Field, PageHeader, TextInput } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";

interface ProductItem {
  id: number;
  name: string;
  unit: string;
  unitPrice: number;
  vatRate: number;
  active: boolean;
  efStockItemId: number | null;
}

interface ImportReport {
  totalInEf: number;
  created: number;
  linked: number;
  skipped: number;
}

interface SettingsFlags {
  efConfigured: boolean;
}

/**
 * Products ("Artikels"): the price list of extras that can be charged on a
 * registration next to hours. Backed by /api/price-list.
 */
export default function ProductsPage() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsFlags>("/api/settings"),
  });

  return (
    <div className="max-w-2xl p-4 md:p-8">
      <PageHeader title="Artikels" />
      <div className="space-y-6">
        <ProductListSection />
        <EfProductImportSection efConfigured={settings?.efConfigured ?? false} />
      </div>
    </div>
  );
}

function ProductListSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("stuk");
  const [price, setPrice] = useState("");
  const [vat, setVat] = useState("21");

  const { data: items } = useQuery({
    queryKey: ["price-list", "all"],
    queryFn: () => apiGet<ProductItem[]>("/api/price-list?includeInactive=1"),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["price-list"] });

  const addMutation = useMutation({
    mutationFn: () =>
      apiSend("/api/price-list", "POST", {
        name,
        unit,
        unitPrice: Number(price.replace(",", ".")),
        vatRate: Number(vat),
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (item: ProductItem) =>
      apiSend(`/api/price-list/${item.id}`, "PATCH", { active: !item.active }),
    onSuccess: invalidate,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Artikels (extra&apos;s)</h2>
      <p className="mt-1 text-sm text-gray-600">
        Wat je naast uren kan aanrekenen bij een registratie. Eenheid max 10
        tekens (limiet van EenvoudigFactureren).
      </p>
      {items && items.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">Nog geen artikels.</p>
      )}
      <ul className="mt-3 divide-y divide-gray-100">
        {items?.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className={item.active ? "" : "text-gray-400 line-through"}>
              {item.name} — € {item.unitPrice.toFixed(2)}/{item.unit} · {item.vatRate}% btw
              {item.efStockItemId !== null && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                  EF
                </span>
              )}
            </span>
            <button
              type="button"
              className="text-xs text-brand-600 hover:underline"
              onClick={() => toggleMutation.mutate(item)}
            >
              {item.active ? "Deactiveren" : "Activeren"}
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
        <div className="w-24">
          <Field label="Eenheid">
            <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={10} required />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Prijs (€)">
            <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Btw">
            <select
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="21">21%</option>
              <option value="12">12%</option>
              <option value="6">6%</option>
              <option value="0">0%</option>
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={addMutation.isPending}>
          + Toevoegen
        </Button>
      </form>
    </section>
  );
}

/** Import of stock items ("artikels") from EenvoudigFactureren. */
function EfProductImportSection({ efConfigured }: { efConfigured: boolean }) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ImportReport | null>(null);

  const importMutation = useMutation({
    mutationFn: () => apiSend<ImportReport>("/api/price-list/import-ef", "POST"),
    onSuccess: (data) => {
      setReport(data);
      void queryClient.invalidateQueries({ queryKey: ["price-list"] });
    },
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">EenvoudigFactureren — artikels importeren</h2>
      <p className="mt-1 text-sm text-gray-600">
        Haalt je artikels op uit EenvoudigFactureren en zet ze in deze lijst.
        Veilig om meermaals te draaien: er worden nooit duplicaten aangemaakt en
        bestaande artikels met dezelfde naam worden enkel gekoppeld, niet
        overschreven. Controleer na de import de btw-percentages.
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
          {importMutation.isPending ? "Bezig met importeren…" : "Importeer artikels uit EF"}
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
            <li>{report.totalInEf} artikels gevonden in EenvoudigFactureren</li>
            <li>{report.created} nieuw aangemaakt</li>
            <li>{report.linked} gekoppeld aan bestaande artikels</li>
            <li>{report.skipped} overgeslagen (al gekoppeld)</li>
          </ul>
        </div>
      )}
    </section>
  );
}
