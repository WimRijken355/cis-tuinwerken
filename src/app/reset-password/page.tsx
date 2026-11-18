"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, authButtonClass, authInputClass } from "@/components/auth-card";

/**
 * Public page behind the e-mailed reset link (?token=…): choose a new
 * password. This also resets 2FA, so the next login runs the 2FA setup.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (password !== confirmPassword) {
      setError("De wachtwoorden zijn niet gelijk");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Er ging iets mis");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <h2 className="mb-2 font-semibold">Nieuw wachtwoord kiezen</h2>
      {!token ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Deze link is onvolledig. Vraag een nieuwe aan via “Wachtwoord vergeten?”.
        </p>
      ) : done ? (
        <div className="space-y-4">
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            Je wachtwoord is aangepast en je tweestapsverificatie is gereset.
          </p>
          <p className="text-sm text-gray-600">
            Meld je nu aan met je nieuwe wachtwoord. Je stelt daarna meteen 2FA opnieuw in met je
            authenticator-app.
          </p>
          <Link href="/login" className={`block text-center ${authButtonClass}`}>
            Naar aanmelden
          </Link>
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
            Let op: hiermee wordt ook je tweestapsverificatie (2FA) gereset. Alle vertrouwde toestellen en
            herstelcodes vervallen.
          </p>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <label className="block">
            <span className="text-sm font-medium">Nieuw wachtwoord</span>
            <input
              type="password"
              className={authInputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              autoFocus
              required
            />
            <span className="text-xs text-gray-500">Minstens 10 tekens</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Herhaal het nieuwe wachtwoord</span>
            <input
              type="password"
              className={authInputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>
          <button type="submit" disabled={busy} className={authButtonClass}>
            {busy ? "Bezig…" : "Wachtwoord opslaan"}
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
