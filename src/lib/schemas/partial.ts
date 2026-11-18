import { z } from "zod";

/**
 * PATCH variant of an object schema: every field optional and WITHOUT its
 * default. Zod's own `.partial()` keeps `.default(...)`, so a PATCH that
 * omits a field would silently reset it (e.g. `active` back to true).
 */
export function partialWithoutDefaults<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{
    [K in keyof Shape]: z.ZodOptional<Shape[K] extends z.ZodDefault<infer T extends z.ZodType> ? T : Shape[K]>;
  }>;
}
