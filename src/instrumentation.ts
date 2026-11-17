/**
 * Next.js instrumentation hook: draait één keer bij het opstarten van de
 * server. Hier starten de achtergrondjobs (herinneringsmails, en vanaf
 * Fase 5 de generatie van terugkerende todo's).
 */
export async function register() {
  // Alleen in het echte Node-serverproces (niet in de edge-runtime van de middleware).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronJobs } = await import("./lib/jobs");
    startCronJobs();
  }
}
