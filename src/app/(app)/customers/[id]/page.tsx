"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ACTION_ICONS } from "@/components/action-icons";
import { CustomerForm } from "@/components/customer-form";
import { CustomerInvoiceDialog } from "@/components/customer-invoice-dialog";
import { CustomerQuotes } from "@/components/customer-quotes";
import { QuoteLinePicker } from "@/components/quote-line-picker";
import { FilterBar, FilterField, selectClass } from "@/components/pagination";
import { RecurringSection } from "@/components/recurring-section";
import { TabPanel, Tabs } from "@/components/tabs";
import { TodoForm, type TodoFormValues } from "@/components/todo-form";
import { ResourceSummary, TodoChecklist } from "@/components/work-pickers";
import {
  Button,
  EmptyState,
  ErrorNote,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  TextInput,
} from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import {
  CUSTOMER_TAB_LABELS,
  customerTabCounts,
  DEFAULT_HISTORY_FILTER,
  filterCustomerHistory,
  HISTORY_STATE_OPTIONS,
  parseCustomerTab,
  type CustomerHistoryFilter,
  type CustomerTab,
} from "@/lib/customer-tabs";
import type { CustomerQuotesResponse } from "@/lib/schemas/quotes";
import type { TodoStateFilter } from "@/lib/todo-list";
import { formatAddress, type CustomerDto, type CustomerInput } from "@/lib/schemas/customers";
import type { RecurringTemplateDto } from "@/lib/schemas/recurring";
import type { TodoDto, TodoTaskDto } from "@/lib/schemas/todos";

interface CustomerDetail extends CustomerDto {
  todos: TodoDto[];
  recurringTemplates: RecurringTemplateDto[];
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CustomerDetailView />
    </Suspense>
  );
}

function CustomerDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseCustomerTab(searchParams.get("tab"));
  // The tab lives in the URL (?tab=), so a reload or a shared link keeps it.
  const setTab = (next: CustomerTab) =>
    router.replace(next === "details" ? `/customers/${id}` : `/customers/${id}?tab=${next}`, { scroll: false });
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const queryKey = ["customer", id];
  const { data: customer, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => apiGet<CustomerDetail>(`/api/customers/${id}`),
  });

  const efLinked = Boolean(customer?.efClientId) && !customer?.isDemo;
  // Same query (cache) as the quotes card: only used for the count on the tab.
  const { data: quotes } = useQuery({
    queryKey: ["customer-quotes", Number(id)],
    queryFn: () => apiGet<CustomerQuotesResponse>(`/api/customers/${id}/quotes`),
    enabled: efLinked,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const updateMutation = useMutation({
    mutationFn: (input: CustomerInput) => apiSend(`/api/customers/${id}`, "PATCH", input),
    onSuccess: () => {
      invalidate();
      setShowEdit(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiSend<{ archived?: boolean }>(`/api/customers/${id}`, "DELETE"),
    onSuccess: (result) => {
      invalidate();
      if (result.archived) {
        setToast("Klant gearchiveerd (had historiek).");
      } else {
        router.replace("/customers");
      }
    },
  });

  const pushEfMutation = useMutation({
    mutationFn: () => apiSend(`/api/customers/${id}/push-ef`, "POST"),
    onSuccess: () => {
      invalidate();
      setToast("Klant gesynchroniseerd met EenvoudigFactureren.");
    },
    onError: (e) => setToast((e as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-8"><ErrorNote message={(error as Error).message} /></div>;
  if (!customer) return null;

  return (
    <div className="p-4 md:p-8">
      <Link href="/customers" className="text-sm text-brand-600 hover:underline">
        ← Alle klanten
      </Link>
      <PageHeader
        title={customer.name}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(true)}>
              {ACTION_ICONS.edit} Bewerken
            </Button>
            <Button
              variant="secondary"
              onClick={() => pushEfMutation.mutate()}
              disabled={pushEfMutation.isPending}
              title="Klantgegevens doorsturen naar EenvoudigFactureren"
            >
              {customer.efClientId ? "↻ Sync EF" : "→ Naar EF"}
            </Button>
          </>
        }
      />

      {toast && (
        <p className="mb-4 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">{toast}</p>
      )}
      {!customer.active && (
        <p className="mb-4 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-600">
          Deze klant is gearchiveerd.
        </p>
      )}

      {(() => {
        const counts = customerTabCounts({
          todos: customer.todos,
          recurringTemplates: customer.recurringTemplates,
          quotes: efLinked ? (quotes?.quotes.length ?? null) : null,
        });
        return (
          <Tabs
            label="Klantfiche"
            active={tab}
            onChange={setTab}
            tabs={[
              {
                id: "details",
                label: CUSTOMER_TAB_LABELS.details,
                badge: counts.quotes !== null ? `${counts.quotes} offerte${counts.quotes === 1 ? "" : "s"}` : undefined,
              },
              { id: "recurring", label: CUSTOMER_TAB_LABELS.recurring, count: counts.recurring },
              {
                id: "new-todo",
                label: CUSTOMER_TAB_LABELS["new-todo"],
                badge: counts.openTodos > 0 ? `${counts.openTodos} open` : undefined,
              },
              {
                id: "history",
                label: CUSTOMER_TAB_LABELS.history,
                count: counts.allTodos,
                badge: counts.openTodos > 0 ? `${counts.openTodos} open` : undefined,
              },
            ]}
          />
        );
      })()}

      {tab === "details" && (
        <TabPanel id="details">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-3 font-semibold">Gegevens</h2>
              <dl className="space-y-2 text-sm">
                <InfoRow label="Adres" value={formatAddress(customer) || "—"} warn={!customer.street ? "Zonder adres geen Waze-navigatie" : undefined} />
                <InfoRow label="E-mail" value={customer.email ?? "—"} warn={!customer.email ? "Zonder e-mail geen herinneringsmails" : undefined} />
                <InfoRow label="Telefoon" value={customer.phone ?? "—"} />
                <InfoRow label="Btw-nummer" value={customer.vatNumber ?? "—"} />
                <InfoRow
                  label="EenvoudigFactureren"
                  value={customer.efClientId ? `Gekoppeld (#${customer.efClientId})` : "Nog niet gekoppeld"}
                />
              </dl>
              {customer.notes && (
                <p className="mt-3 whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm text-gray-600">
                  {customer.notes}
                </p>
              )}
              <div className="mt-4">
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm("Deze klant verwijderen of archiveren?")) deleteMutation.mutate();
                  }}
                  disabled={deleteMutation.isPending}
                >
                  {ACTION_ICONS.delete} Klant verwijderen
                </Button>
              </div>
            </div>
            <CustomerQuotes customerId={customer.id} efLinked={efLinked} />
          </div>
        </TabPanel>
      )}

      {tab === "recurring" && (
        <TabPanel id="recurring">
          <RecurringSection customerId={customer.id} templates={customer.recurringTemplates} onChanged={invalidate} />
        </TabPanel>
      )}

      {tab === "new-todo" && (
        <TabPanel id="new-todo">
          <NewTodoPanel
            customerId={customer.id}
            onCreated={() => {
              invalidate();
              setToast("Todo toegevoegd — je vindt hem in Historiek en in de planning bij \"In te plannen\".");
            }}
          />
        </TabPanel>
      )}

      {tab === "history" && (
        <TabPanel id="history">
          <HistoryPanel customer={customer} onChanged={invalidate} onToast={setToast} />
        </TabPanel>
      )}

      <Modal title="Klant bewerken" open={showEdit} onClose={() => setShowEdit(false)}>
        <CustomerForm
          initial={customer}
          onSubmit={(input) => updateMutation.mutate(input)}
          busy={updateMutation.isPending}
          error={updateMutation.error ? (updateMutation.error as Error).message : null}
        />
      </Modal>
    </div>
  );
}

function InfoRow({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd>{value}</dd>
      {warn && value === "—" && <dd className="text-xs text-amber-600">⚠ {warn}</dd>}
    </div>
  );
}

/** "Nieuwe todo" tab: a one-off todo for this customer (with project toggle and quote lines). */
function NewTodoPanel({ customerId, onCreated }: { customerId: number; onCreated: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  // Bumped after a successful create to remount (= reset) the form.
  const [formKey, setFormKey] = useState(0);
  const [quoteLineIds, setQuoteLineIds] = useState<number[]>([]);

  const addMutation = useMutation({
    mutationFn: (values: TodoFormValues) => apiSend("/api/todos", "POST", { customerId, ...values, quoteLineIds }),
    onSuccess: () => {
      setFormError(null);
      setQuoteLineIds([]);
      setFormKey((k) => k + 1);
      onCreated();
    },
    onError: (e) => setFormError((e as Error).message),
  });

  return (
    <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Nieuwe todo</h2>
      <TodoForm
        key={formKey}
        showProject
        extra={<QuoteLinePicker customerId={customerId} value={quoteLineIds} onChange={setQuoteLineIds} />}
        submitLabel="Toevoegen"
        busy={addMutation.isPending}
        error={formError}
        onSubmit={(values) => addMutation.mutate(values)}
      />
    </div>
  );
}

/** "Historiek" tab: all todos of the customer (open and closed) with filters and actions. */
function HistoryPanel({
  customer,
  onChanged,
  onToast,
}: {
  customer: { id: number; todos: TodoDto[] };
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [invoicing, setInvoicing] = useState(false);
  const [filter, setFilter] = useState<CustomerHistoryFilter>(DEFAULT_HISTORY_FILTER);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoDto | null>(null);
  const [editQuoteLineIds, setEditQuoteLineIds] = useState<number[]>([]);
  const startEditing = (t: TodoDto) => {
    setEditQuoteLineIds(t.quoteLineIds ?? []);
    setEditing(t);
  };

  const editMutation = useMutation({
    mutationFn: ({ todoId, values }: { todoId: number; values: TodoFormValues }) =>
      apiSend(`/api/todos/${todoId}`, "PATCH", { ...values, quoteLineIds: editQuoteLineIds }),
    onSuccess: () => {
      setEditing(null);
      onChanged();
    },
  });
  const patchTodo = useMutation({
    mutationFn: ({ todoId, status }: { todoId: number; status: string }) =>
      apiSend(`/api/todos/${todoId}`, "PATCH", { status }),
    onSuccess: onChanged,
    onError: (e) => setActionError((e as Error).message),
  });
  const toggleTask = useMutation({
    mutationFn: ({ todoId, task }: { todoId: number; task: TodoTaskDto }) =>
      apiSend(`/api/todos/${todoId}/tasks/${task.id}`, "PATCH", { done: !task.done }),
    onSuccess: onChanged,
    onError: (e) => setActionError((e as Error).message),
  });
  const deleteTodo = useMutation({
    mutationFn: (todoId: number) => apiSend(`/api/todos/${todoId}`, "DELETE"),
    onSuccess: onChanged,
    onError: (e) => setActionError((e as Error).message),
  });

  const visible = filterCustomerHistory(customer.todos, filter);
  const filterActive = filter.text.trim() !== "" || filter.state !== DEFAULT_HISTORY_FILTER.state;

  return (
    <section>
      <FilterBar active={filterActive} onReset={() => setFilter(DEFAULT_HISTORY_FILTER)}>
        <FilterField label="Zoeken" className="w-full sm:w-64">
          <TextInput
            type="search"
            placeholder="Titel of omschrijving…"
            value={filter.text}
            onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
          />
        </FilterField>
        <FilterField label="Status" className="w-full sm:w-64">
          <select
            className={selectClass}
            value={filter.state}
            onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value as TodoStateFilter }))}
          >
            {HISTORY_STATE_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="ml-auto self-end">
          <Button type="button" variant="secondary" onClick={() => setInvoicing(true)}>
            🧾 Factuur maken
          </Button>
        </div>
      </FilterBar>
      {actionError && <ErrorNote message={actionError} />}
      {invoicing && (
        <CustomerInvoiceDialog
          customerId={customer.id}
          onClose={() => setInvoicing(false)}
          onDone={(message) => {
            setInvoicing(false);
            onToast(message);
            onChanged();
          }}
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-2 text-xs text-gray-500">
          {visible.length} van {customer.todos.length} todo{customer.todos.length === 1 ? "" : "'s"}
        </p>
        {visible.length === 0 ? (
          <EmptyState>
            {customer.todos.length === 0 ? "Nog geen todo's voor deze klant." : "Geen todo's die aan de filter voldoen."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((t) => {
              const open = t.status === "OPEN" || t.status === "PLANNED";
              return (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${open ? "" : "text-gray-600"}`}>{t.title}</p>
                    <p className="text-sm text-gray-500">
                      ± {t.estimatedHours} u
                      {t.isProject && (
                        <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">Project</span>
                      )}
                      {t.windowLabel && open && (
                        <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                          Voorkeur: {t.windowLabel}
                        </span>
                      )}
                      {!open && t.completedAt && (
                        <span className="ml-2 text-xs">
                          afgesloten {new Date(t.completedAt).toLocaleDateString("nl-BE")}
                        </span>
                      )}
                    </p>
                    {open && (
                      <>
                        <div className="mt-1">
                          <ResourceSummary resources={t.resources} />
                        </div>
                        <TodoChecklist
                          tasks={t.tasks}
                          disabled={toggleTask.isPending}
                          onToggle={(task) => toggleTask.mutate({ todoId: t.id, task })}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={t.status} />
                    {open && <ActionButton action="edit" onClick={() => startEditing(t)} />}
                    {t.status === "OPEN" && (
                      <ActionButton action="delete" iconOnly label="Todo verwijderen" onClick={() => deleteTodo.mutate(t.id)} />
                    )}
                    {t.status === "CANCELLED" && (
                      <button
                        type="button"
                        className="min-h-11 px-1 text-xs text-brand-600 hover:underline"
                        onClick={() => patchTodo.mutate({ todoId: t.id, status: "OPEN" })}
                      >
                        Heropenen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal title="Todo bewerken" open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <TodoForm
            key={editing.id}
            initial={{
              title: editing.title,
              estimatedHours: editing.estimatedHours,
              resources: editing.resources ?? [],
              tasks: editing.tasks ?? [],
              isProject: editing.isProject,
            }}
            showProject
            extra={
              <QuoteLinePicker
                customerId={customer.id}
                todoId={editing.id}
                value={editQuoteLineIds}
                onChange={setEditQuoteLineIds}
              />
            }
            submitLabel="Bewaren"
            busy={editMutation.isPending}
            error={editMutation.error ? (editMutation.error as Error).message : null}
            onSubmit={(values) => editMutation.mutate({ todoId: editing.id, values })}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </section>
  );
}
