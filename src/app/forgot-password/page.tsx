"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthCard, authButtonClass, authInputClass } from "@/components/auth-card";

/**
 * Public "Wachtwoord vergeten?" page: asks a reset link for a username or
 * e-mail address. The answer is always the same (no account enumeration).
 */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Er ging iets mis");
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <h2 className="mb-2 font-semibold">Wachtwoord vergeten</h2>
      {message ? (
        <div className="space-y-4">
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
          <p className="text-sm text-gray-600">
            Kijk in je mailbox (ook bij spam). De link is 60 minuten geldig.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-gray-600">
            Geef je gebruikersnaam of e-mailadres in. Je krijgt een e-mail met een link om een nieuw wachtwoord
            te kiezen. Daarbij wordt ook je tweestapsverificatie (2FA) gereset: bij de volgende aanmelding stel
            je die opnieuw in.
          </p>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <label className="block">
            <span className="text-sm font-medium">Gebruikersnaam of e-mailadres</span>
            <input
              className={authInputClass}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          <button type="submit" disabled={busy} className={authButtonClass}>
            {busy ? "Bezig…" : "Stuur me een link"}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-brand-600 hover:underline">
          ← Terug naar aanmelden
        </Link>
      </p>
    </AuthCard>
  );
}
