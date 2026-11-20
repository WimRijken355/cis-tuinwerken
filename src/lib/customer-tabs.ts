import type { TodoDto } from "./schemas/todos";
import { matchesTodoState, type TodoStateFilter } from "./todo-list";

/**
 * Tabs of the customer page (`/customers/:id?tab=`): details, recurring work,
 * a new one-off todo for this customer, and the history of its todos. Pure
 * logic (tab ids, counts on the tab headers, history filter) so it can be
 * tested without the page.
 */

export const CUSTOMER_TABS = ["details", "recurring", "new-todo", "history"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

export const CUSTOMER_TAB_LABELS: Record<CustomerTab, string> = {
  details: "Gegevens",
  recurring: "Terugkerend werk",
  "new-todo": "Nieuwe todo",
  history: "Historiek",
};

/** `?tab=` value → tab; anything unknown opens the details. */
export function parseCustomerTab(value: string | null | undefined): CustomerTab {
  return (CUSTOMER_TABS as readonly string[]).includes(value ?? "") ? (value as CustomerTab) : "details";
}

export interface CustomerTabCounts {
  /** Quotes from EF (shown on "Gegevens"); null when the customer is not linked to EF. */
  quotes: number | null;
  /** Recurring work templates. */
  recurring: number;
  /** Still to do (in te plannen + ingepland) — also shown on "Nieuwe todo". */
  openTodos: number;
  /** All todos, open and closed. */
  allTodos: number;
}

/** The record counts on the tab headers, so you see whether a tab has data without opening it. */
export function customerTabCounts(customer: {
  todos: Pick<TodoDto, "status">[];
  recurringTemplates: unknown[];
  quotes?: number | null;
}): CustomerTabCounts {
  return {
    quotes: customer.quotes ?? null,
    recurring: customer.recurringTemplates.length,
    openTodos: customer.todos.filter((t) => matchesTodoState(t.status, "ACTIVE")).length,
    allTodos: customer.todos.length,
  };
}

export interface CustomerHistoryFilter {
  /** Matches title or description (case-insensitive). */
  text: string;
  state: TodoStateFilter;
}

export const DEFAULT_HISTORY_FILTER: CustomerHistoryFilter = { text: "", state: "" };

export const HISTORY_STATE_OPTIONS: { value: TodoStateFilter; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "ACTIVE", label: "Open (in te plannen + ingepland)" },
  { value: "OPEN", label: "In te plannen" },
  { value: "PLANNED", label: "Ingepland" },
  { value: "CLOSED", label: "Afgesloten (klaar + geannuleerd)" },
  { value: "DONE", label: "Klaar" },
  { value: "CANCELLED", label: "Geannuleerd" },
];

/**
 * History of the customer's todos: filtered, open work first, then the most
 * recent first (completedAt for closed todos, otherwise creation date).
 */
export function filterCustomerHistory<
  T extends Pick<TodoDto, "title" | "status" | "completedAt"> & { description?: string | null; createdAt?: string },
>(todos: T[], filter: CustomerHistoryFilter): T[] {
  const text = filter.text.trim().toLowerCase();
  const isOpen = (t: T) => matchesTodoState(t.status, "ACTIVE");
  const when = (t: T) => new Date(t.completedAt ?? t.createdAt ?? 0).getTime();
  return todos
    .filter((t) => matchesTodoState(t.status, filter.state))
    .filter((t) => !text || `${t.title} ${t.description ?? ""}`.toLowerCase().includes(text))
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || when(b) - when(a));
}
