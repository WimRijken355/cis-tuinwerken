"use client";

import { ChecklistManager } from "@/components/checklist-manager";
import { PageHeader } from "@/components/ui";

/** Checklist: the standard tasks that can be ticked on todos and recurring work. */
export default function ChecklistPage() {
  return (
    <div className="max-w-2xl p-4 md:p-8">
      <PageHeader title="Checklist" />
      <ChecklistManager />
    </div>
  );
}
