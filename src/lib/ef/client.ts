import { config } from "../config";
import type {
  EfClient,
  EfClientInput,
  EfInvoiceInput,
  EfInvoiceResult,
  EfStockItem,
} from "./types";

/**
 * HTTP-client voor de EenvoudigFactureren API (v1).
 *
 * Belangrijk (uit de officiële docs):
 * - Altijd `Accept: application/json` meesturen — zonder die header antwoordt
 *   de API in XML.
 * - Partial updates via POST /clients/{id}; nooit PUT (reset weggelaten velden).
 * - Auth is configuratie: EF_AUTH_MODE "apikey" (headernaam in
 *   EF_API_KEY_HEADER) of "basic". Zo is de exacte header een .env-detail.
 */

const BASE_URL = "https://eenvoudigfactureren.be/api/v1";

export class EfApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public responseBody: string,
  ) {
    super(message);
  }
}

/** Is er een API-key of basic-login geconfigureerd? */
export function efIsConfigured(): boolean {
  const c = config();
  return c.EF_AUTH_MODE === "apikey"
    ? Boolean(c.EF_API_KEY)
    : Boolean(c.EF_BASIC_USER && c.EF_BASIC_PASS);
}

function buildHeaders(): Record<string, string> {
  const c = config();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (c.EF_AUTH_MODE === "apikey") {
    if (!c.EF_API_KEY) {
      throw new EfApiError("EF_API_KEY ontbreekt in .env", 0, "");
    }
    headers[c.EF_API_KEY_HEADER] = c.EF_API_KEY;
  } else {
    if (!c.EF_BASIC_USER || !c.EF_BASIC_PASS) {
      throw new EfApiError("EF_BASIC_USER/EF_BASIC_PASS ontbreken in .env", 0, "");
    }
    const encoded = Buffer.from(`${c.EF_BASIC_USER}:${c.EF_BASIC_PASS}`).toString("base64");
    headers.Authorization = `Basic ${encoded}`;
  }

  if (c.EF_ACCOUNT_ID) {
    headers["X-AccountId"] = c.EF_ACCOUNT_ID;
  }
  return headers;
}

async function efFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: buildHeaders(),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new EfApiError(
      `EenvoudigFactureren antwoordde ${response.status} op ${init.method ?? "GET"} ${path}`,
      response.status,
      text.slice(0, 2000),
    );
  }
  // Sommige antwoorden (bv. 201 zonder body) kunnen leeg zijn.
  return (text ? JSON.parse(text) : null) as T;
}

// ---------------------------------------------------------------------------
// Klanten
// ---------------------------------------------------------------------------

/** Haalt ALLE klanten op, gepagineerd (take 100 per pagina). */
export async function listAllClients(): Promise<EfClient[]> {
  const all: EfClient[] = [];
  const take = 100;
  for (let skip = 0; ; skip += take) {
    const page = await efFetch<EfClient[]>(`/clients?skip=${skip}&take=${take}`);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < take) break;
  }
  return all;
}

/** Maakt een klant aan; geeft het nieuwe client_id terug. */
export async function createClient(input: EfClientInput): Promise<number> {
  const result = await efFetch<{ client_id?: number; id?: number }>("/clients", {
    method: "POST",
    body: input,
  });
  const id = result?.client_id ?? result?.id;
  if (!id) {
    throw new EfApiError("EF gaf geen client_id terug bij het aanmaken", 0, JSON.stringify(result));
  }
  return id;
}

/** Partial update (POST, nooit PUT — PUT reset weggelaten velden). */
export async function updateClientPartial(
  clientId: number,
  input: Partial<EfClientInput>,
): Promise<void> {
  await efFetch(`/clients/${clientId}`, { method: "POST", body: input });
}

// ---------------------------------------------------------------------------
// Artikels (stock items)
// ---------------------------------------------------------------------------

/** Fetches ALL stock items, paginated (take 100 per page). */
export async function listAllStockItems(): Promise<EfStockItem[]> {
  const all: EfStockItem[] = [];
  const take = 100;
  for (let skip = 0; ; skip += take) {
    const page = await efFetch<EfStockItem[]>(`/stockitems?skip=${skip}&take=${take}`);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < take) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Facturen
// ---------------------------------------------------------------------------

/** Maakt een (concept)factuur aan; geeft het EF-invoice_id terug. */
export async function createInvoice(input: EfInvoiceInput): Promise<number> {
  const result = await efFetch<EfInvoiceResult & { id?: number }>("/invoices", {
    method: "POST",
    body: input,
  });
  const id = result?.invoice_id ?? result?.id;
  if (!id) {
    throw new EfApiError("EF gaf geen invoice_id terug bij het aanmaken", 0, JSON.stringify(result));
  }
  return id;
}
