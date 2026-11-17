"use client";

import { useState } from "react";
import type { CustomerDto, CustomerInput } from "@/lib/schemas/customers";
import { Button, ErrorNote, Field, TextArea, TextInput } from "./ui";

/** Formulier voor het aanmaken/bewerken van een klant (gedeeld door beide flows). */
export function CustomerForm({
  initial,
  onSubmit,
  busy,
  error,
}: {
  initial?: Partial<CustomerDto>;
  onSubmit: (input: CustomerInput) => void;
  busy: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    street: initial?.street ?? "",
    postalCode: initial?.postalCode ?? "",
    city: initial?.city ?? "",
    vatNumber: initial?.vatNumber ?? "",
    notes: initial?.notes ?? "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, countryCode: "BE", active: true });
      }}
    >
      {error && <ErrorNote message={error} />}
      <Field label="Naam *">
        <TextInput value={form.name} onChange={set("name")} required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="E-mailadres" hint="Nodig voor de herinneringsmail">
          <TextInput type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Telefoon">
          <TextInput value={form.phone} onChange={set("phone")} />
        </Field>
      </div>
      <Field label="Straat + nummer" hint="Nodig voor navigatie met Waze">
        <TextInput value={form.street} onChange={set("street")} />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Postcode">
          <TextInput value={form.postalCode} onChange={set("postalCode")} />
        </Field>
        <Field label="Gemeente">
          <TextInput value={form.city} onChange={set("city")} />
        </Field>
      </div>
      <Field label="Btw-nummer" hint="Alleen voor zakelijke klanten">
        <TextInput value={form.vatNumber} onChange={set("vatNumber")} placeholder="BE0123456789" />
      </Field>
      <Field label="Notities">
        <TextArea rows={3} value={form.notes} onChange={set("notes")} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Bezig…" : "Bewaren"}
        </Button>
      </div>
    </form>
  );
}
