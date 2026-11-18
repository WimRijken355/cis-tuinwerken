/**
 * Centered card with the app logo, shared by the public auth pages
 * (login, forgot password, reset password). Phone-first.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-md">
        <div className="mb-6 text-center">
          <div className="text-3xl">🌿</div>
          <h1 className="mt-1 text-xl font-bold text-brand-700">Tuinwerken Cis</h1>
          <p className="text-sm text-gray-500">Planning &amp; facturatie</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export const authInputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";
export const authButtonClass =
  "w-full rounded-md bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50";
