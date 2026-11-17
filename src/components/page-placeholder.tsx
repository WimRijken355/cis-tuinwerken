/** Tijdelijke inhoud voor schermen die in een latere fase gebouwd worden. */
export function PagePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-600">{description}</p>
        <p className="mt-2 text-sm text-gray-400">Wordt gebouwd in {phase}.</p>
      </div>
    </div>
  );
}
