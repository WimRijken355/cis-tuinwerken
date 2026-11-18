"use client";

import { SortableListManager } from "@/components/sortable-list-manager";
import { PageHeader } from "@/components/ui";

/** Losse todo's: the quick picks offered when creating a losse todo in the planning. */
export default function LooseTodoPresetsPage() {
  return (
    <div className="max-w-2xl p-4 md:p-8">
      <PageHeader title="Losse todo's" />
      <SortableListManager
        apiPath="/api/loose-todo-presets"
        queryKey="loose-todo-presets"
        intro={
          <>
            Snelkeuzes voor een losse todo (zonder klant uit je klantenbestand), bv. &quot;Vakantie&quot; of
            &quot;Doktersafspraak&quot;. Ze verschijnen als knoppen wanneer je in de planning een losse todo maakt;
            de volgorde hier is de volgorde daar.
          </>
        }
        newPlaceholder="Nieuw type, bv. Beurs bezoeken"
        emptyText="Nog geen types."
      />
    </div>
  );
}
