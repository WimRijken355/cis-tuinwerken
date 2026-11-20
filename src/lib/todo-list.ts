import type { TodoDto } from "./schemas/todos";

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
}

/** Default: the open work (what is still to be done). */
export const DEFAULT_TODO_FILTER: TodoListFilter = { text: "", state: "ACTIVE", kind: "", resourceId: null };

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
  Partial<Pick<TodoDto, "customerName" | "customerCity" | "description" | "resources">>;

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
    filter.resourceId !== null
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
