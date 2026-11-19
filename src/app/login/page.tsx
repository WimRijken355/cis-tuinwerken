"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppLogoFull } from "@/components/app-logo";
import { START_PATH } from "@/components/nav-items";

/**
 * Aanmeldflow in stappen:
 *  1. password      — gebruikersnaam of e-mailadres + wachtwoord
 *  2. totp          — code uit de authenticator-app (of herstelcode),
 *                     met "vertrouw dit toestel 30 dagen"
 *  3. setup-qr      — eerste keer: QR-code scannen
 *  4. setup-confirm — eerste code bevestigen
 *  5. recovery      — herstelcodes tonen (eenmalig!)
 */

type Step = "password" | "totp" | "setup-qr" | "setup-confirm" | "recovery";

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Er ging iets mis");
  }
  return data;
}

/** After logging in: always the Dagplanning (START_PATH). */
function goToApp(router: ReturnType<typeof useRouter>) {
  router.replace(START_PATH);
  router.refresh();
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  const submitPassword = () =>
    run(async () => {
      const data = await postJson("/api/auth/login", { username, password });
      if (data.ok) {
        goToApp(router);
      } else if (data.needsTotpSetup) {
        const setup = await postJson("/api/auth/totp/setup");
        setQrDataUrl(setup.qrDataUrl);
        setOtpauthUrl(setup.otpauthUrl);
        setStep("setup-qr");
      } else if (data.needsTotp) {
        setStep("totp");
      }
    });

  const submitTotp = () =>
    run(async () => {
      await postJson("/api/auth/totp/verify", {
        code,
        trustDevice,
        deviceLabel: navigator.userAgent.includes("Mobile") ? "Telefoon" : "Computer",
      });
      goToApp(router);
    });

  const submitSetupConfirm = () =>
    run(async () => {
      const data = await postJson("/api/auth/totp/confirm", { code });
      setRecoveryCodes(data.recoveryCodes ?? []);
      setStep("recovery");
    });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-md">
        <div className="mb-6 text-center">
          <h1>
            <AppLogoFull className="mx-auto h-40 w-auto" />
          </h1>
          <p className="mt-2 text-sm text-gray-500">Planning &amp; facturatie</p>
        </div>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {step === "password" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="text-sm font-medium">Gebruikersnaam of e-mailadres</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Wachtwoord</span>
              <input
                type="password"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Bezig…" : "Aanmelden"}
            </button>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="text-brand-600 hover:underline">
                Wachtwoord vergeten?
              </Link>
            </p>
          </form>
        )}

        {step === "totp" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitTotp();
            }}
            className="space-y-4"
          >
            <p className="text-sm text-gray-600">
              Geef de 6-cijferige code uit je authenticator-app in, of een
              herstelcode.
            </p>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
              required
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
              />
              Vertrouw dit toestel 30 dagen
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Bezig…" : "Bevestigen"}
            </button>
          </form>
        )}

        {step === "setup-qr" && (
          <div className="space-y-4">
            <h2 className="font-semibold">Tweestapsverificatie instellen</h2>
            <p className="text-sm text-gray-600">
              Scan deze QR-code met een authenticator-app zoals Google
              Authenticator of Microsoft Authenticator.
            </p>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR-code voor authenticator-app" className="mx-auto" />
            )}
            {otpauthUrl && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer">Kan je niet scannen?</summary>
                <p className="mt-1 break-all">{otpauthUrl}</p>
              </details>
            )}
            <button
              type="button"
              onClick={() => {
                setCode("");
                setStep("setup-confirm");
              }}
              className="w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700"
            >
              Ik heb de code gescand
            </button>
          </div>
        )}

        {step === "setup-confirm" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitSetupConfirm();
            }}
            className="space-y-4"
          >
            <p className="text-sm text-gray-600">
              Geef de code in die je authenticator-app nu toont, om de setup te
              bevestigen.
            </p>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Bezig…" : "2FA activeren"}
            </button>
          </form>
        )}

        {step === "recovery" && (
          <div className="space-y-4">
            <h2 className="font-semibold">Herstelcodes</h2>
            <p className="text-sm text-gray-600">
              Bewaar deze codes op een veilige plek (niet op deze computer).
              Elke code werkt één keer als je je authenticator-app kwijt bent.
              <strong> Ze worden maar één keer getoond.</strong>
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-3 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToApp(router)}
              className="w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700"
            >
              Ik heb ze bewaard — naar de app
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
