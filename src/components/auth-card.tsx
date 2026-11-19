import { AppLogoFull } from "./app-logo";

/**
 * Centered card with the app logo, shared by the public auth pages
 * (login, forgot password, reset password). Phone-first.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-md">
        <div className="mb-6 text-center">
          <h1>
            <AppLogoFull className="mx-auto h-40 w-auto" />
          </h1>
          <p className="mt-2 text-sm text-gray-500">Planning &amp; facturatie</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export const authInputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";
export const authButtonClass =
  "w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50";
