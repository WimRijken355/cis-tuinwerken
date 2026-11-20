import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `<Field>` renders a `<label>`. Clickable controls must never sit inside it:
 * Safari/WebKit (every browser on iPhone, Safari on Mac) forwards a click on
 * the label to the label's *first labelable descendant*, looked up after
 * React has already re-rendered. In the customer picker that meant: tap a
 * customer → it is selected → the picker re-renders with its "Wijzigen"
 * button → WebKit clicks that button → the selection is undone. Chrome/Edge
 * don't do this, so it only failed on Apple devices.
 * Composite controls (pickers, buttons, toggles) go in `<FieldGroup>` (a div).
 */

const SRC = join(__dirname, "..");
const CLICKABLE = /<button\b|<Button\b|<ActionButton\b|<Toggle\b|<HoursStepper\b|<\w*Picker\b/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** `<Field ...>children</Field>` blocks whose children contain a clickable control. */
export function clickablesInFieldLabels(source: string): string[] {
  const blocks = source.match(/<Field\b[^>]*>[\s\S]*?<\/Field>/g) ?? [];
  return blocks.filter((block) => CLICKABLE.test(block)).map((block) => block.split("\n")[0].trim());
}

describe("Field labels never wrap clickable controls (WebKit label-click bug)", () => {
  it("detects a picker or button inside a Field", () => {
    expect(clickablesInFieldLabels(`<Field label="Klant">\n  <CustomerPicker value={c} />\n</Field>`)).toHaveLength(1);
    expect(clickablesInFieldLabels(`<Field label="X"><button type="button">a</button></Field>`)).toHaveLength(1);
    expect(clickablesInFieldLabels(`<Field label="Naam"><TextInput value={v} /></Field>`)).toEqual([]);
    expect(clickablesInFieldLabels(`<FieldGroup label="Klant"><CustomerPicker /></FieldGroup>`)).toEqual([]);
  });

  it("no component in the app puts a clickable control inside a Field", () => {
    const offenders = tsxFiles(SRC).flatMap((file) =>
      clickablesInFieldLabels(readFileSync(file, "utf8")).map((line) => `${relative(SRC, file)}: ${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
