"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorNote, Field, Modal, PageHeader, Spinner, TextInput } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth-client";
import type { CreateUserInput, RoleValue, UserDto } from "@/lib/schemas/users";
import { formatDateShort } from "@/lib/time";

/**
 * User management (ADMIN-only — see requireAdmin() in src/lib/api.ts).
 * Create users, assign roles, and remove users. The API itself still
 * enforces ADMIN access, so this page simply shows a clear denial message
 * for a SUPERUSER who navigates here directly.
 */

const ROLE_LABELS: Record<RoleValue, string> = {
  ADMIN: "Beheerder",
  SUPERUSER: "Superuser",
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [showNew, setShowNew] = useState(false);

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<UserDto[]>("/api/users"),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["users"] });

  const createMutation = useMutation({
    mutationFn: (input: CreateUserInput) => apiSend<UserDto>("/api/users", "POST", input),
    onSuccess: () => {
      invalidate();
      setShowNew(false);
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: RoleValue }) =>
      apiSend<UserDto>(`/api/users/${id}`, "PATCH", { role }),
    onSuccess: invalidate,
    onError: (e) => window.alert((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/users/${id}`, "DELETE"),
    onSuccess: invalidate,
    onError: (e) => window.alert((e as Error).message),
  });

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Gebruikers"
        actions={<Button onClick={() => setShowNew(true)}>+ Nieuwe gebruiker</Button>}
      />

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}

      {users && users.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.username}</p>
                <p className="truncate text-sm text-gray-500">
                  Sinds {formatDateShort(u.createdAt)} ·{" "}
                  {u.totpEnabledAt ? "2FA ingesteld" : "2FA nog niet ingesteld"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={u.role}
                  disabled={roleMutation.isPending}
                  onChange={(e) =>
                    roleMutation.mutate({ id: u.id, role: e.target.value as RoleValue })
                  }
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="danger"
                  disabled={deleteMutation.isPending || u.id === me?.user?.id}
                  title={u.id === me?.user?.id ? "Je kan jezelf niet verwijderen" : undefined}
                  onClick={() => {
                    if (confirm(`Gebruiker "${u.username}" verwijderen?`)) {
                      deleteMutation.mutate(u.id);
                    }
                  }}
                >
                  Verwijderen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal title="Nieuwe gebruiker" open={showNew} onClose={() => setShowNew(false)}>
        <NewUserForm
          onSubmit={(input) => createMutation.mutate(input)}
          busy={createMutation.isPending}
          error={createMutation.error ? (createMutation.error as Error).message : null}
        />
      </Modal>
    </div>
  );
}

function NewUserForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (input: CreateUserInput) => void;
  busy: boolean;
  error: string | null;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleValue>("SUPERUSER");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ username, password, role });
      }}
    >
      {error && <ErrorNote message={error} />}
      <Field label="Gebruikersnaam *">
        <TextInput value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </Field>
      <Field label="Wachtwoord *" hint="Minstens 10 tekens">
        <TextInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          required
        />
      </Field>
      <Field label="Rol *">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleValue)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-gray-400">
        De nieuwe gebruiker stelt 2FA zelf in bij de eerste aanmelding.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Bezig…" : "Aanmaken"}
        </Button>
      </div>
    </form>
  );
}
