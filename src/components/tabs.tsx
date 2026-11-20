"use client";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Record count on the tab header (hidden when undefined). */
  count?: number;
  /** Secondary count, e.g. "3 open" (hidden when 0 or undefined). */
  badge?: string;
}

/**
 * Tab row with record counts on the headers. Scrolls horizontally on a phone;
 * the panels are rendered by the caller (only the active one).
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm ${
              selected
                ? "border-brand-600 font-semibold text-brand-700"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  tab.count > 0 ? "bg-brand-100 text-brand-800" : "bg-gray-100 text-gray-400"
                }`}
              >
                {tab.count}
              </span>
            )}
            {tab.badge && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Panel belonging to a tab (accessibility wiring only). */
export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
