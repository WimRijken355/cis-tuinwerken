import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every "Todo bewerken" dialog must offer the manual status (TodoStatusPicker),
 * otherwise it depends on the screen whether you can set a todo to "Klaar"
 * (v0.59.0 forgot the editor on the customer page). It is a fallback placed
 * right above the save/cancel buttons: passed in the form's slot that TodoForm
 * renders just before its buttons (`extra`, via TodoEditor `footer`).
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

/** `<Modal title="Todo bewerken" …>` blocks where the picker is not passed in the form's extra/footer slot. */
export function editDialogsWithStatusOutsideForm(source: string): number {
  const dialogs = source.match(/<Modal\s+title="Todo bewerken"[\s\S]*?<\/Modal>/g) ?? [];
  return dialogs.filter((d) => !/\b(extra|footer)=\{[\s\S]{0,600}?<TodoStatusPicker\b/.test(d)).length;
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

  it("the picker sits right above the save/cancel buttons (form slot)", () => {
    expect(
      editDialogsWithStatusOutsideForm(`<Modal title="Todo bewerken" open>
<TodoForm />
<TodoStatusPicker todoId={1} />
</Modal>`),
    ).toBe(1);
    expect(
      editDialogsWithStatusOutsideForm(`<Modal title="Todo bewerken" open>
<TodoEditor footer={<TodoStatusPicker todoId={1} />} />
</Modal>`),
    ).toBe(0);
    const offenders = tsxFiles(SRC)
      .filter((file) => editDialogsWithStatusOutsideForm(readFileSync(file, "utf8")) > 0)
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("TodoForm renders its slot right before the buttons, and TodoEditor passes footer into it", () => {
    const form = readFileSync(join(SRC, "components", "todo-form.tsx"), "utf8");
    expect(form).toMatch(/\{extra\}\s*<div className="flex justify-end gap-2">/);
    const editor = readFileSync(join(SRC, "components", "todo-editor.tsx"), "utf8");
    expect(editor).toContain("extra={footer}");
  });
});
