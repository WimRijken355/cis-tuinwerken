import { describe, expect, it } from "vitest";
import {
  generatedTodoExtras,
  generatedTodoFields,
  recurringTemplateInputSchema,
  recurringTemplateUpdateSchema,
  toRecurringExtrasDto,
  patternData,
  pickPatternFields,
  templateProblems,
  toRecurrencePattern,
  toRecurrenceRule,
} from "./recurring";

const window = { label: "Mei", startMonth: 5, endMonth: 5 };

describe("recurringTemplateInputSchema", () => {
  it("accepts resources and checklist tasks, defaulting to none", () => {
    const base = { customerId: 1, title: "Haag scheren", estimatedHours: 3, windows: [window] };
    expect(recurringTemplateInputSchema.parse(base)).toMatchObject({ resources: [], taskIds: [] });
    expect(
      recurringTemplateInputSchema.parse({
        ...base,
        resources: [{ resourceId: 2, hours: 3 }, { resourceId: 5, hours: "1,5".replace(",", ".") }],
        taskIds: [7, 3],
      }),
    ).toMatchObject({ resources: [{ resourceId: 2, hours: 3 }, { resourceId: 5, hours: 1.5 }], taskIds: [7, 3] });
  });

  it("rejects duplicate resources", () => {
    expect(() =>
      recurringTemplateInputSchema.parse({
        customerId: 1,
        title: "X",
        estimatedHours: 1,
        windows: [window],
        resources: [{ resourceId: 2, hours: 1 }, { resourceId: 2, hours: 1 }],
      }),
    ).toThrow();
  });

  it("leaves resources/tasks untouched on an update that omits them", () => {
    const update = recurringTemplateUpdateSchema.parse({ title: "Nieuw" });
    expect(update.resources).toBeUndefined();
    expect(update.taskIds).toBeUndefined();
    // Regression: .partial() kept the defaults and reset these on every update.
    expect(update.leadTimeDays).toBeUndefined();
    expect(update.active).toBeUndefined();
    expect(update.invoiceDescription).toBeUndefined();
  });

  it("trims the invoice description; empty means default", () => {
    const base = { customerId: 1, title: "Gras", estimatedHours: 1, windows: [window] };
    expect(recurringTemplateInputSchema.parse(base).invoiceDescription).toBeUndefined();
    expect(
      recurringTemplateInputSchema.parse({ ...base, invoiceDescription: "  Tuinonderhoud  " }).invoiceDescription,
    ).toBe("Tuinonderhoud");
    expect(recurringTemplateUpdateSchema.parse({ invoiceDescription: "  " }).invoiceDescription).toBeNull();
    expect(() => recurringTemplateInputSchema.parse({ ...base, invoiceDescription: "x".repeat(201) })).toThrow();
  });
});

describe("generatedTodoFields", () => {
  it("copies the invoice description onto the generated todo", () => {
    expect(
      generatedTodoFields({
        customerId: 4,
        title: "Gras afrijden",
        description: "Zijpoort",
        invoiceDescription: "Tuinonderhoud volgens contract",
        estimatedHours: 2,
      }),
    ).toEqual({
      customerId: 4,
      title: "Gras afrijden",
      description: "Zijpoort",
      invoiceDescription: "Tuinonderhoud volgens contract",
      estimatedHours: 2,
    });
  });
});

describe("recurring extras", () => {
  const template = {
    resources: [{ resourceId: 2, hours: "3.00", resource: { name: "Jan", type: "PERSON" as const } }],
    tasks: [
      { checklistItemId: 7, checklistItem: { name: "Haag scheren" } },
      { checklistItemId: 3, checklistItem: { name: "Snoeiafval afvoeren" } },
    ],
  };

  it("maps a template to resource and task DTOs", () => {
    expect(toRecurringExtrasDto(template)).toEqual({
      resources: [{ resourceId: 2, name: "Jan", type: "PERSON", hours: 3 }],
      tasks: [
        { checklistItemId: 7, name: "Haag scheren" },
        { checklistItemId: 3, name: "Snoeiafval afvoeren" },
      ],
    });
  });

  it("copies resources and the checklist (name snapshot, in order) onto a generated todo", () => {
    expect(generatedTodoExtras(42, template)).toEqual({
      resources: [{ todoId: 42, resourceId: 2, hours: "3.00" }],
      tasks: [
        { todoId: 42, checklistItemId: 7, label: "Haag scheren", sortOrder: 0 },
        { todoId: 42, checklistItemId: 3, label: "Snoeiafval afvoeren", sortOrder: 1 },
      ],
    });
  });
});

describe("Outlook-style pattern on a template", () => {
  const base = { customerId: 1, title: "Gras afrijden", estimatedHours: 1.5 };

  it("a new template defaults to the yearly periods, which need at least one period", () => {
    const parsed = recurringTemplateInputSchema.parse(base);
    expect(parsed.recurrence).toBe("PERIODS");
    expect(templateProblems({ ...parsed, windowCount: 0 })).toEqual(["Minstens één periode per jaar."]);
    expect(templateProblems({ ...parsed, windowCount: 2 })).toEqual([]);
  });

  it("a weekly template needs a start date and weekdays, not periods", () => {
    const parsed = recurringTemplateInputSchema.parse({
      ...base,
      recurrence: "WEEKLY",
      weekdays: [2],
      startDate: "2027-03-01",
      seasonStartMonth: 4,
      seasonEndMonth: 10,
    });
    expect(templateProblems({ ...parsed, windowCount: 0 })).toEqual([]);
    expect(templateProblems({ ...parsed, weekdays: [], windowCount: 0 })).toEqual(["Kies minstens één weekdag."]);
    expect(toRecurrenceRule(parsed)).toMatchObject({ kind: "WEEKLY", weekdays: [2], startDate: "2027-03-01" });
  });

  it("a PATCH only touches the pattern fields it sends (no defaults sneak in)", () => {
    const patch = recurringTemplateUpdateSchema.parse({ title: "Maaien", interval: 2 });
    expect(pickPatternFields(patch)).toEqual({ interval: 2 });
    expect(patch.recurrence).toBeUndefined();
  });

  it("stores dates as calendar days and reads them back as yyyy-MM-dd", () => {
    const data = patternData({ startDate: "2027-03-01", endDate: null });
    expect(data.startDate?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(data.endDate).toBeNull();
    expect(data.interval).toBeUndefined();
    const back = toRecurrencePattern({
      recurrence: "MONTHLY",
      interval: 1,
      weekdays: [],
      monthlyMode: "NTH_WEEKDAY",
      monthDay: null,
      monthWeek: 5,
      monthWeekday: 5,
      startDate: new Date("2027-03-01T00:00:00Z"),
      endDate: null,
      maxOccurrences: 6,
      seasonStartMonth: null,
      seasonEndMonth: null,
    });
    expect(back.startDate).toBe("2027-03-01");
    expect(toRecurrenceRule({ ...back, recurrence: "PERIODS" })).toBeNull();
  });
});
