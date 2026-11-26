import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every "Todo bewerken" dialog must offer the manual status (TodoStatusPicker),
 * otherwise it depends on the screen whether you can set a todo to "Klaar"
 * (v0.59.0 forgot the editor on the customer page). It is a fallback, so it is
 * always the last thing in the dialog.
 */

const SRC = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** `<Modal title="Todo bewerken" …>…</Modal>` blocks without a TodoStatusPicker. */
export function editDialogsWithoutStatus(source: string): number {
  const dialogs = source.match(/<Modal\s+title="Todo bewerken"[\s\S]*?<\/Modal>/g) ?? [];
  return dialogs.filter((d) => !d.includes("<TodoStatusPicker")).length;
}

/** `<Modal title="Todo bewerken" …>` blocks whose last element is not the TodoStatusPicker. */
export function editDialogsWithStatusNotLast(source: string): number {
  const dialogs = source.match(/<Modal\s+title="Todo bewerken"[\s\S]*?<\/Modal>/g) ?? [];
  return dialogs.filter((d) => !/<TodoStatusPicker[^>]*\/>\}?\s*<\/Modal>$/.test(d)).length;
}

describe("status picker in every todo edit dialog", () => {
  it("detects an edit dialog without picker", () => {
    expect(editDialogsWithoutStatus(`<Modal title="Todo bewerken" open>\n<TodoForm />\n</Modal>`)).toBe(1);
    expect(
      editDialogsWithoutStatus(`<Modal title="Todo bewerken" open>\n<TodoStatusPicker todoId={1} />\n</Modal>`),
    ).toBe(0);
    expect(editDialogsWithoutStatus(`<Modal title="Klant bewerken" open>\n</Modal>`)).toBe(0);
  });

  it("all todo edit dialogs in the app have the status picker", () => {
    const files = tsxFiles(SRC);
    const withDialog = files.filter((file) => /<Modal\s+title="Todo bewerken"/.test(readFileSync(file, "utf8")));
    expect(withDialog.length).toBeGreaterThanOrEqual(2);
    const offenders = withDialog
      .filter((file) => editDialogsWithoutStatus(readFileSync(file, "utf8")) > 0)
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("the picker is always at the very bottom of the dialog", () => {
    expect(
      editDialogsWithStatusNotLast(`<Modal title="Todo bewerken" open>
<TodoStatusPicker todoId={1} />
<TodoForm />
</Modal>`),
    ).toBe(1);
    expect(
      editDialogsWithStatusNotLast(`<Modal title="Todo bewerken" open>
<TodoForm />
{todo && <TodoStatusPicker todoId={1} />}
</Modal>`),
    ).toBe(0);
    const offenders = tsxFiles(SRC)
      .filter((file) => editDialogsWithStatusNotLast(readFileSync(file, "utf8")) > 0)
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
