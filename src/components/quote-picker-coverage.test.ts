import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every place where a todo for a customer is created or edited must offer the
 * EF quote lines (QuoteLinePicker), otherwise linking depends on which screen
 * you happen to use. Customer todo forms are recognisable by `showProject`
 * (the project toggle only exists for customer todos); TodoEditor covers the
 * planning and the Todo's overview.
 */

const SRC = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** `<TodoForm ... />` elements (up to their self-closing end) that are customer forms without a quote picker. */
export function customerTodoFormsWithoutQuotes(source: string): number {
  const forms = source.match(/<TodoForm\b[\s\S]*?\/>\s*\n/g) ?? [];
  return forms.filter((f) => /\bshowProject\b/.test(f) && !f.includes("<QuoteLinePicker")).length;
}

describe("quote line picker on every customer todo form", () => {
  it("detects a customer TodoForm without picker", () => {
    expect(customerTodoFormsWithoutQuotes(`<TodoForm\n  showProject\n  submitLabel="x"\n/>\n`)).toBe(1);
    expect(
      customerTodoFormsWithoutQuotes(`<TodoForm\n  showProject\n  extra={<QuoteLinePicker customerId={1} value={[]} onChange={f} />}\n/>\n`),
    ).toBe(0);
    // A TodoForm without showProject (e.g. a losse todo in the editor) is not a customer form.
    expect(customerTodoFormsWithoutQuotes(`<TodoForm\n  submitLabel="x"\n/>\n`)).toBe(0);
  });

  it("all customer TodoForms in the app pass a QuoteLinePicker", () => {
    const offenders = tsxFiles(SRC)
      .filter((file) => !file.endsWith("todo-editor.tsx"))
      .filter((file) => customerTodoFormsWithoutQuotes(readFileSync(file, "utf8")) > 0)
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("the shared TodoEditor (planning, Todo's) shows the picker for a customer", () => {
    const editor = readFileSync(join(SRC, "components", "todo-editor.tsx"), "utf8");
    expect(editor).toContain("<QuoteLinePicker");
  });
});
