/**
 * CLI for the demo data (same logic as Settings → Algemeen → Demodata):
 *   npm run demo:on      load the demo dataset
 *   npm run demo:off     remove it again
 *   npm run demo:status  show whether it is loaded
 */
import { getDemoStatus, installDemoData, removeDemoData } from "../src/lib/demo/demo-data";

async function main() {
  const command = process.argv[2];
  if (command === "on") {
    const result = await installDemoData();
    console.log(
      `✔ Demodata geladen: ${result.customers} klanten, ${result.todos} todo's (waarvan ${result.recurringTodos} uit terugkerend werk).`,
    );
  } else if (command === "off") {
    const r = await removeDemoData();
    console.log(
      `✔ Demodata verwijderd: ${r.customers} klanten, ${r.todos} todo's, ` +
        `${r.resourcesDeleted} machines, ${r.checklistDeleted} checklist-taken` +
        (r.resourcesDeactivated + r.checklistDeactivated > 0
          ? ` (${r.resourcesDeactivated + r.checklistDeactivated} nog in gebruik → gedeactiveerd)`
          : ""),
    );
  } else if (command === "status") {
    const s = await getDemoStatus();
    console.log(s.active ? `Demodata actief: ${s.customers} klanten, ${s.todos} todo's.` : "Geen demodata geladen.");
  } else {
    console.error("Gebruik: npm run demo:on | demo:off | demo:status");
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
