/**
 * Demo dataset for trying out the planning: fictitious customers in the
 * Kempen region with todos of very different sizes (from a few hours up to
 * six working days, to test splitting work over several days) and different
 * resource combinations.
 *
 * Pure data (no DB access) so the rules below can be unit tested:
 * - the person "Cis" is on every todo and every recurring template;
 * - "Wim" and "Ken" are only on some of them;
 * - several todos take more than 2–3 working days (WORKDAY_HOURS each).
 *
 * People are referenced by name and reused if they already exist (they are
 * real resources and are never removed). Machines and checklist items that
 * do not exist yet are created with isDemo = true.
 */

export const WORKDAY_HOURS = 8;

export const DEMO_PEOPLE = ["Cis", "Wim", "Ken"] as const;
export type DemoPerson = (typeof DEMO_PEOPLE)[number];

export const DEMO_MACHINES = [
  { name: "Minigraver", hourlyRate: 55 },
  { name: "Verticuteermachine", hourlyRate: 25 },
  { name: "Aanhangwagen", hourlyRate: 15 },
] as const;
export type DemoMachine = (typeof DEMO_MACHINES)[number]["name"];

export const DEMO_CHECKLIST = [
  "Snoeien",
  "Gras afrijden",
  "Blaadjes harken",
  "Haag scheren",
  "Onkruid wieden",
  "Snoeiafval afvoeren",
  "Grond nivelleren",
  "Graszoden leggen",
] as const;
export type DemoTask = (typeof DEMO_CHECKLIST)[number];

export type DemoResources = Partial<Record<DemoPerson | DemoMachine, number>>;

export interface DemoTodo {
  title: string;
  description?: string;
  /** Total time; may differ from the sum of the resource hours. */
  estimatedHours: number;
  resources: DemoResources;
  tasks?: DemoTask[];
}

export interface DemoRecurring {
  title: string;
  estimatedHours: number;
  leadTimeDays: number;
  windows: { label: string; startMonth: number; endMonth: number }[];
  resources: DemoResources;
  tasks?: DemoTask[];
}

export interface DemoCustomer {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string;
  notes?: string;
  todos: DemoTodo[];
  recurring?: DemoRecurring[];
}

const days = (n: number) => n * WORKDAY_HOURS;

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    name: "Familie Peeters",
    street: "Boerenkrijglaan 12",
    postalCode: "2260",
    city: "Westerlo",
    phone: "0470 11 22 01",
    notes: "Hond loopt vrij in de tuin — eerst aanbellen.",
    todos: [
      {
        title: "Volledige tuinaanleg voor- en achtertuin",
        description: "Grond afgraven, nivelleren, borders en gazon. ± 5 werkdagen.",
        estimatedHours: days(5),
        resources: { Cis: days(5), Wim: days(4), Ken: days(4), Minigraver: 12 },
        tasks: ["Grond nivelleren", "Graszoden leggen", "Snoeiafval afvoeren"],
      },
      {
        title: "Haag scheren langs de straatkant",
        estimatedHours: 4,
        resources: { Cis: 4 },
        tasks: ["Haag scheren", "Snoeiafval afvoeren"],
      },
    ],
    recurring: [
      {
        title: "Haag scheren",
        estimatedHours: 4,
        leadTimeDays: 30,
        windows: [
          { label: "Mei", startMonth: 5, endMonth: 5 },
          { label: "Sep–Okt", startMonth: 9, endMonth: 10 },
        ],
        resources: { Cis: 4 },
        tasks: ["Haag scheren", "Snoeiafval afvoeren"],
      },
    ],
  },
  {
    name: "Van den Broeck",
    street: "Kleine Vaartstraat 3",
    postalCode: "2440",
    city: "Geel",
    phone: "0470 11 22 02",
    todos: [
      {
        title: "Terras in kasseien aanleggen",
        description: "± 4 werkdagen, kasseien worden geleverd op dag 1.",
        estimatedHours: days(4),
        resources: { Cis: days(4), Ken: days(4), Minigraver: 8, Aanhangwagen: 4 },
        tasks: ["Grond nivelleren", "Snoeiafval afvoeren"],
      },
    ],
  },
  {
    name: "Janssens-Wouters",
    street: "Molenstraat 45",
    postalCode: "2230",
    city: "Herselt",
    phone: "0470 11 22 03",
    todos: [
      {
        title: "Gazon vernieuwen",
        description: "Verticuteren, bijzaaien en bemesten. 2 werkdagen.",
        estimatedHours: days(2),
        resources: { Cis: days(2), Wim: 8, Verticuteermachine: 6 },
        tasks: ["Gras afrijden", "Onkruid wieden"],
      },
      {
        title: "Bladeren ruimen",
        estimatedHours: 3,
        resources: { Cis: 3 },
        tasks: ["Blaadjes harken"],
      },
    ],
  },
  {
    name: "Mertens Luc",
    street: "Kerkplein 8",
    postalCode: "2400",
    city: "Mol",
    phone: "0470 11 22 04",
    todos: [
      {
        title: "Vijver graven en aanleggen",
        description: "± 3 werkdagen. Folie ligt klaar in de garage.",
        estimatedHours: days(3),
        resources: { Cis: days(3), Wim: days(3), Minigraver: 10 },
        tasks: ["Grond nivelleren", "Snoeiafval afvoeren"],
      },
    ],
  },
  {
    name: "Claes An",
    street: "Lindelei 21",
    postalCode: "2250",
    city: "Olen",
    phone: "0470 11 22 05",
    todos: [
      {
        title: "Snoeiwerk fruitbomen",
        estimatedHours: 6,
        resources: { Cis: 6, Ken: 6 },
        tasks: ["Snoeien", "Snoeiafval afvoeren"],
      },
    ],
    recurring: [
      {
        title: "Herfstbeurt: bladeren ruimen",
        estimatedHours: 3,
        leadTimeDays: 30,
        windows: [{ label: "Nov–Dec", startMonth: 11, endMonth: 12 }],
        resources: { Cis: 3, Wim: 3 },
        tasks: ["Blaadjes harken", "Snoeiafval afvoeren"],
      },
    ],
  },
  {
    name: "De Smet Bouw bv",
    street: "Industrieweg 140",
    postalCode: "3980",
    city: "Tessenderlo",
    phone: "0470 11 22 06",
    notes: "Bedrijfsterrein — melden aan de receptie.",
    todos: [
      {
        title: "Oprit en borders bedrijfsterrein heraanleggen",
        description: "Grootste project: ± 6 werkdagen, liefst aaneensluitend.",
        estimatedHours: days(6),
        resources: { Cis: days(6), Wim: days(5), Ken: days(5), Minigraver: 16, Aanhangwagen: 8 },
        tasks: ["Grond nivelleren", "Onkruid wieden", "Snoeiafval afvoeren"],
      },
    ],
  },
  {
    name: "Verhoeven Marc",
    street: "Diestsebaan 77",
    postalCode: "2430",
    city: "Laakdal",
    phone: "0470 11 22 07",
    todos: [
      {
        title: "Onderhoudsbeurt tuin",
        estimatedHours: 5,
        resources: { Cis: 5 },
        tasks: ["Gras afrijden", "Onkruid wieden", "Snoeien"],
      },
    ],
  },
  {
    name: "Willems-Jacobs",
    street: "Lichtaartsebaan 9",
    postalCode: "2460",
    city: "Kasterlee",
    phone: "0470 11 22 08",
    todos: [
      {
        title: "Schutting plaatsen achterkant tuin",
        description: "± 2,5 werkdagen.",
        estimatedHours: 20,
        resources: { Cis: 20, Ken: 20, Aanhangwagen: 2 },
      },
    ],
  },
  {
    name: "Goossens Els",
    street: "Bergstraat 33",
    postalCode: "2220",
    city: "Heist-op-den-Berg",
    phone: "0470 11 22 09",
    todos: [
      {
        title: "Boomstronken frezen en gazon herstellen",
        estimatedHours: 12,
        resources: { Cis: 12, Wim: 12 },
        tasks: ["Grond nivelleren", "Graszoden leggen"],
      },
    ],
  },
  {
    name: "Lenaerts Tom",
    street: "Genebroek 5",
    postalCode: "3945",
    city: "Ham",
    phone: "0470 11 22 10",
    todos: [
      {
        title: "Moestuin aanleggen",
        estimatedHours: 10,
        resources: { Cis: 10 },
        tasks: ["Grond nivelleren", "Onkruid wieden"],
      },
      {
        title: "Kleine snoeibeurt",
        estimatedHours: 2,
        resources: { Cis: 2 },
        tasks: ["Snoeien"],
      },
    ],
  },
];
