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

/**
 * Stock item ("artikel") in EF. Only the fields this app reads.
 * `tax_category` is EF's VAT category (0-3); see mapEfTaxCategory().
 */
export interface EfStockItem {
  stockitem_id: number;
  code?: string | null;
  description?: string | null;
  type?: "single" | "list" | "combined" | "combined_fixed";
  price?: number | null;
  tax_category?: number | null;
  /** Configurable VAT rate code when the account uses dynamic VAT rates. */
  tax_code?: string | null;
  tax_included?: boolean | null;
  unit?: string | null;
  active?: "yes" | "no" | null;
}

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
