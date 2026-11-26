import { z } from "zod";

/**
 * Setting a todo's status by hand ("Status" in the todo editor), e.g. a job
 * with blocks still planned that does not have to be done any more → "Klaar".
 *
 * - "In te plannen" / "Ingepland" are one choice: the todo is (re)opened and its
 *   status follows the planning (a planned block → PLANNED, else OPEN), exactly
 *   like syncTodoStatus — so the status never contradicts the planning.
 * - "Klaar" / "Geannuleerd": blocks still planned are cancelled (taken out of
 *   the planning); registered work is kept (a DONE todo can still be invoiced).
 */

export type TodoStatus = "OPEN" | "PLANNED" | "DONE" | "CANCELLED";

export const manualTodoStatusSchema = z.object({
  status: z.enum(["OPEN", "PLANNED", "DONE", "CANCELLED"]),
});

/** The status actually stored for a manual choice (OPEN/PLANNED follow the planning). */
export function manualStatusTarget(requested: TodoStatus, plannedBlocks: number): TodoStatus {
  if (requested === "OPEN" || requested === "PLANNED") return plannedBlocks > 0 ? "PLANNED" : "OPEN";
  return requested;
}

/** Options in the status picker: one "open" option (per the planning), Klaar, Geannuleerd. */
export function manualStatusOptions(plannedBlocks: number): { value: TodoStatus; label: string }[] {
  return [
    plannedBlocks > 0 ? { value: "PLANNED", label: "Ingepland" } : { value: "OPEN", label: "In te plannen" },
    { value: "DONE", label: "Klaar" },
    { value: "CANCELLED", label: "Geannuleerd" },
  ];
}

/** The option to show as selected for the current status. */
export function manualStatusValue(status: TodoStatus, plannedBlocks: number): TodoStatus {
  return manualStatusTarget(status, plannedBlocks);
}

/**
 * Confirmation text before a manual status change, or null when nothing needs
 * confirming (no blocks are cancelled and no uninvoiced work is dropped).
 */
export function manualStatusWarning(
  target: TodoStatus,
  ctx: { plannedBlocks: number; uninvoicedDays: number; invoiceable: boolean },
): string | null {
  if (target !== "DONE" && target !== "CANCELLED") return null;
  const lines: string[] = [];
  if (ctx.plannedBlocks > 0) {
    lines.push(
      ctx.plannedBlocks === 1
        ? "Het geplande blok wordt uit de planning gehaald."
        : `De ${ctx.plannedBlocks} geplande blokken worden uit de planning gehaald.`,
    );
  }
  if (target === "CANCELLED" && ctx.invoiceable && ctx.uninvoicedDays > 0) {
    lines.push("Er is geregistreerd werk dat nog niet gefactureerd is; een geannuleerde todo wordt niet meer gefactureerd.");
  }
  if (lines.length === 0) return null;
  return [...lines, "", target === "DONE" ? "Toch op klaar zetten?" : "Toch annuleren?"].join("\n");
}
