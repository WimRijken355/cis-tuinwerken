"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ACTION_ICONS } from "@/components/action-icons";
import { CustomerForm } from "@/components/customer-form";
import { RecurringSection } from "@/components/recurring-section";
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
} from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatAddress, type CustomerDto, type CustomerInput } from "@/lib/schemas/customers";
import type { RecurringTemplateDto } from "@/lib/schemas/recurring";
import type { TodoDto, TodoTaskDto } from "@/lib/schemas/todos";

interface CustomerDetail extends CustomerDto {
  todos: TodoDto[];
  recurringTemplates: RecurringTemplateDto[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const queryKey = ["customer", id];
  const { data: customer, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => apiGet<CustomerDetail>(`/api/customers/${id}`),
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

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Gegevens */}
        <section className="space-y-4">
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
          </div>

          <RecurringSection
            customerId={customer.id}
            templates={customer.recurringTemplates}
            onChanged={invalidate}
          />

          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Deze klant verwijderen of archiveren?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            {ACTION_ICONS.delete} Klant verwijderen
          </Button>
        </section>

        {/* Todo's */}
        <TodoSection customer={customer} onChanged={invalidate} />
      </div>

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

/** Todo's van deze klant: toevoegen, bekijken, annuleren/verwijderen. */
function TodoSection({
  customer,
  onChanged,
}: {
  customer: { id: number; todos: TodoDto[] };
  onChanged: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  // Bumped after a successful create to remount (= reset) the form.
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<TodoDto | null>(null);

  const addMutation = useMutation({
    mutationFn: (values: TodoFormValues) =>
      apiSend("/api/todos", "POST", { customerId: customer.id, ...values }),
    onSuccess: () => {
      setFormError(null);
      setFormKey((k) => k + 1);
      onChanged();
    },
    onError: (e) => setFormError((e as Error).message),
  });

  const editMutation = useMutation({
    mutationFn: ({ todoId, values }: { todoId: number; values: TodoFormValues }) =>
      apiSend(`/api/todos/${todoId}`, "PATCH", values),
    onSuccess: () => {
      setEditing(null);
      onChanged();
    },
  });

  const patchTodo = useMutation({
    mutationFn: ({ todoId, status }: { todoId: number; status: string }) =>
      apiSend(`/api/todos/${todoId}`, "PATCH", { status }),
    onSuccess: onChanged,
  });

  const toggleTask = useMutation({
    mutationFn: ({ todoId, task }: { todoId: number; task: TodoTaskDto }) =>
      apiSend(`/api/todos/${todoId}/tasks/${task.id}`, "PATCH", { done: !task.done }),
    onSuccess: onChanged,
    onError: (e) => setFormError((e as Error).message),
  });

  const deleteTodo = useMutation({
    mutationFn: (todoId: number) => apiSend(`/api/todos/${todoId}`, "DELETE"),
    onSuccess: onChanged,
    onError: (e) => setFormError((e as Error).message),
  });

  const open = customer.todos.filter((t) => t.status === "OPEN" || t.status === "PLANNED");
  const closed = customer.todos.filter((t) => t.status === "DONE" || t.status === "CANCELLED");

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Nieuwe todo</h2>
        <TodoForm
          key={formKey}
          showProject
          submitLabel="Toevoegen"
          busy={addMutation.isPending}
          error={formError}
          onSubmit={(values) => addMutation.mutate(values)}
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Open werk ({open.length})</h2>
        {open.length === 0 ? (
          <EmptyState>Geen open todo&apos;s voor deze klant.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100">
            {open.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="text-sm text-gray-500">
                    ± {t.estimatedHours} u
                    {t.windowLabel && (
                      <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">
                        Voorkeur: {t.windowLabel}
                      </span>
                    )}
                  </p>
                  <div className="mt-1">
                    <ResourceSummary resources={t.resources} />
                  </div>
                  <TodoChecklist
                    tasks={t.tasks}
                    disabled={toggleTask.isPending}
                    onToggle={(task) => toggleTask.mutate({ todoId: t.id, task })}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={t.status} />
                  <ActionButton action="edit" onClick={() => setEditing(t)} />
                  {t.status === "OPEN" && (
                    <ActionButton action="delete" iconOnly label="Todo verwijderen" onClick={() => deleteTodo.mutate(t.id)} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {closed.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">
            Afgerond &amp; geannuleerd ({closed.length})
          </summary>
          <ul className="mt-2 divide-y divide-gray-100">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <p className="truncate text-sm text-gray-600">{t.title}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} />
                  {t.status === "CANCELLED" && (
                    <button
                      type="button"
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => patchTodo.mutate({ todoId: t.id, status: "OPEN" })}
                    >
                      Heropenen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

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
