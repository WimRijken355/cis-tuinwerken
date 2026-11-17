/**
 * Typen voor de EenvoudigFactureren REST API (v1).
 * Bron: https://eenvoudigfactureren.be/api-docs/index.html
 * Alleen de velden die deze app gebruikt zijn opgenomen.
 */

export interface EfClient {
  client_id: number;
  name: string;
  street?: string | null;
  street2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  /** Btw-nummer van de klant. */
  tax_code?: string | null;
  email_address?: string | null;
  phone_number?: string | null;
  /** Vrij veld voor externe koppeling — wij zetten hier ons eigen customer-id in. */
  external_client_id?: string | null;
}

export type EfClientInput = Partial<Omit<EfClient, "client_id">> & { name: string };

/** Factuurregel. amount = eenheidsprijs excl. btw; unit max 10 tekens. */
export interface EfInvoiceItem {
  type: "item" | "text";
  description: string;
  amount?: number;
  quantity?: number;
  unit?: string;
  /** Btw-percentage, bv. 21 of 6; moet passen binnen de tarieven van het document. */
  tax_rate?: number;
}

export interface EfInvoiceInput {
  client_id: number;
  /** "concept" = conceptfactuur (geen nummer/definitief) — onze standaard. */
  status?: "concept";
  date?: string; // yyyy-MM-dd
  days_due?: number;
  currency?: string;
  language?: string;
  tax_included?: "yes" | "no";
  note?: string;
  items: EfInvoiceItem[];
}

export interface EfInvoiceResult {
  invoice_id: number;
}
