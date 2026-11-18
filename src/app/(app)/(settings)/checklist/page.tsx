"use client";

import { SortableListManager } from "@/components/sortable-list-manager";
import { PageHeader } from "@/components/ui";

/** Checklist: the standard tasks that can be ticked on todos and recurring work. */
export default function ChecklistPage() {
  return (
    <div className="max-w-2xl p-4 md:p-8">
      <PageHeader title="Checklist" />
      <SortableListManager
        apiPath="/api/checklist-items"
        queryKey="checklist-items"
        intro={
          <>
            Standaardtaken die je aanvinkt bij een todo of bij terugkerend werk (bv. &quot;Haag scheren&quot;,
            &quot;Snoeiafval afvoeren&quot;). Een bestaande todo houdt de naam die de taak had toen hij werd
            toegevoegd.
          </>
        }
        newPlaceholder="Nieuwe taak, bv. Gras maaien"
        emptyText="Nog geen taken."
      />
    </div>
  );
}
