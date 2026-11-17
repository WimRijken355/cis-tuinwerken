/**
 * Fetch-helper voor client components. Gooit een Error met de
 * foutboodschap van de server ({ error: "..." }) zodat de UI die
 * rechtstreeks kan tonen.
 */

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      (res.status === 401 ? "Niet aangemeld" : "Er ging iets mis");
    throw new Error(message);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return parseResponse<T>(res);
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return parseResponse<T>(res);
}
