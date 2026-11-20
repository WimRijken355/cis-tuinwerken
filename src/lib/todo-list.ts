import type { TodoDto, TodoInvoiceState } from "./schemas/todos";

/**
 * Client-side filters of the todo overview (Todo's). Pure logic so it can be
 * tested without the page.
 */

/**
 * State filter: "ACTIVE" = still to do (in te plannen + ingepland), "CLOSED" =
 * finished (klaar + geannuleerd), a single status, or "" (all).
 */
export type TodoStateFilter = "" | "ACTIVE" | "CLOSED" | TodoDto["status"];

/** Owner filter: customer todos, losse todo's (no customer) or "" (both). */
export type TodoKindFilter = "" | "customer" | "loose";

export interface TodoListFilter {
  /** Matches title, customer/contact name, city or description (case-insensitive). */
  text: string;
  state: TodoStateFilter;
  kind: TodoKindFilter;
  /** Only todos with this resource assigned; null = any. */
  resourceId: number | null;
  /** Invoice filter (see TODO_INVOICE_FILTER_OPTIONS); "" = any. */
  invoice: TodoInvoiceFilter;
}

/** Invoice filter: not (fully) invoiced, invoiced but not in EF yet, in EF. */
export type TodoInvoiceFilter = "" | "uninvoiced" | "not_in_ef" | "in_ef";

/** Default: the open work (what is still to be done). */
export const DEFAULT_TODO_FILTER: TodoListFilter = { text: "", state: "ACTIVE", kind: "", resourceId: null, invoice: "" };

export const TODO_STATE_OPTIONS: { value: TodoStateFilter; label: string }[] = [
  { value: "ACTIVE", label: "Open (in te plannen + ingepland)" },
  { value: "OPEN", label: "In te plannen" },
  { value: "PLANNED", label: "Ingepland" },
  { value: "CLOSED", label: "Afgewerkt (klaar + geannuleerd)" },
  { value: "DONE", label: "Klaar" },
  { value: "CANCELLED", label: "Geannuleerd" },
  { value: "", label: "Alle" },
];

export const TODO_KIND_OPTIONS: { value: TodoKindFilter; label: string }[] = [
  { value: "", label: "Klant + losse todo's" },
  { value: "customer", label: "Enkel klanten" },
  { value: "loose", label: "Enkel losse todo's" },
];

type FilterableTodo = Pick<TodoDto, "title" | "status" | "customerId"> &
  Partial<Pick<TodoDto, "customerName" | "customerCity" | "description" | "resources" | "invoiceState">>;

export function matchesTodoState(status: TodoDto["status"], state: TodoStateFilter): boolean {
  if (state === "") return true;
  if (state === "ACTIVE") return status === "OPEN" || status === "PLANNED";
  if (state === "CLOSED") return status === "DONE" || status === "CANCELLED";
  return status === state;
}

export function matchesTodoFilter(todo: FilterableTodo, filter: TodoListFilter): boolean {
  const text = filter.text.trim().toLowerCase();
  if (text) {
    const haystack = [todo.title, todo.customerName ?? "", todo.customerCity ?? "", todo.description ?? ""]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  if (!matchesTodoState(todo.status, filter.state)) return false;
  if (filter.kind === "customer" && todo.customerId === null) return false;
  if (filter.kind === "loose" && todo.customerId !== null) return false;
  if (filter.resourceId !== null && !(todo.resources ?? []).some((r) => r.resourceId === filter.resourceId)) {
    return false;
  }
  if (filter.invoice && !matchesInvoiceFilter(todo.invoiceState ?? "none", filter.invoice)) return false;
  return true;
}

export function filterTodos<T extends FilterableTodo>(todos: T[], filter: TodoListFilter): T[] {
  return todos.filter((t) => matchesTodoFilter(t, filter));
}

/** Does the filter differ from the default (shows the "reset" link)? */
export function isTodoFilterActive(filter: TodoListFilter): boolean {
  return (
    Boolean(filter.text.trim()) ||
    filter.state !== DEFAULT_TODO_FILTER.state ||
    filter.kind !== "" ||
    filter.resourceId !== null ||
    filter.invoice !== ""
  );
}

/**
 * What may still be done with a todo from its detail dialog:
 * - delete: only without any blocks (otherwise cancel it — same rule as the API);
 * - cancel: only while nothing is planned (status OPEN) and no work has been
 *   registered on it yet (that work still has to be invoiced);
 * - reopen: a cancelled todo goes back to "in te plannen".
 */
export function todoStatusActions(
  status: TodoDto["status"],
  blocks: { status: "PLANNED" | "DONE" | "CANCELLED" | string }[],
): { canDelete: boolean; canCancel: boolean; canReopen: boolean } {
  const registered = blocks.some((b) => b.status === "DONE");
  return {
    canDelete: blocks.length === 0 && status !== "DONE",
    canCancel: status === "OPEN" && !registered,
    canReopen: status === "CANCELLED",
  };
}

export const TODO_INVOICE_FILTER_OPTIONS: { value: TodoInvoiceFilter; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "uninvoiced", label: "Nog (deels) te factureren" },
  { value: "not_in_ef", label: "Factuur nog niet in EF" },
  { value: "in_ef", label: "Factuur in EF" },
];

function matchesInvoiceFilter(state: TodoInvoiceState, filter: TodoInvoiceFilter): boolean {
  if (filter === "uninvoiced") return state === "uninvoiced" || state === "partly";
  if (filter === "not_in_ef") return state === "not_synced" || state === "failed" || state === "pending" || state === "excluded";
  if (filter === "in_ef") return state === "in_ef";
  return true;
}

/**
 * Invoice state of a todo from its registered days (one entry per day, with
 * the invoice it is on or null). With several invoices the one that needs
 * attention wins: failed > not synced > pending > excluded > in EF.
 */
export function todoInvoiceState(
  days: { invoice: { pushStatus: string; efInvoiceId: number | null; syncExcluded: boolean } | null }[],
): TodoInvoiceState {
  if (days.length === 0) return "none";
  const invoices = days.flatMap((d) => (d.invoice ? [d.invoice] : []));
  if (invoices.length === 0) return "uninvoiced";
  if (invoices.length < days.length) return "partly";
  const states = invoices.map((i): TodoInvoiceState =>
    i.efInvoiceId !== null || i.pushStatus === "CONCEPT_CREATED"
      ? "in_ef"
      : i.syncExcluded
        ? "excluded"
        : i.pushStatus === "FAILED"
          ? "failed"
          : i.pushStatus === "PENDING"
            ? "pending"
            : "not_synced",
  );
  for (const s of ["failed", "not_synced", "pending", "excluded"] as const) if (states.includes(s)) return s;
  return "in_ef";
}

/** Label + colour of the invoice state in the overview (nothing for "none"). */
export const TODO_INVOICE_BADGES: Record<Exclude<TodoInvoiceState, "none">, { label: string; cls: string }> = {
  uninvoiced: { label: "Niet gefactureerd", cls: "bg-amber-100 text-amber-800" },
  partly: { label: "Deels gefactureerd", cls: "bg-amber-100 text-amber-800" },
  not_synced: { label: "Factuur niet in EF", cls: "bg-gray-100 text-gray-700" },
  pending: { label: "Factuur: push bezig", cls: "bg-amber-100 text-amber-800" },
  failed: { label: "Factuur: push mislukt", cls: "bg-red-100 text-red-800" },
  excluded: { label: "Factuur: niet versturen", cls: "bg-gray-100 text-gray-500" },
  in_ef: { label: "Factuur in EF ✓", cls: "bg-green-100 text-green-800" },
};

/**
 * "Klaargemeld" date of a todo in the overview: the work date of its last
 * registered block; a todo closed without registration falls back to its
 * completedAt. Null when nothing was registered/closed. ISO string.
 */
export function registeredOn(registeredBlockDates: (Date | string)[], completedAt: Date | string | null): string | null {
  const times = registeredBlockDates.map((d) => new Date(d).getTime());
  if (times.length > 0) return new Date(Math.max(...times)).toISOString();
  return completedAt ? new Date(completedAt).toISOString() : null;
}
