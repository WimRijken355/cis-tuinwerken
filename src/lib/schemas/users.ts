import { z } from "zod";

/** Contracts for /api/users (user management — ADMIN-only, see requireAdmin()). */

export const roleSchema = z.enum(["ADMIN", "SUPERUSER"]);
export type RoleValue = z.infer<typeof roleSchema>;

/** Required, stored lowercase; login works with username or e-mail. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Ongeldig e-mailadres").max(200));

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Gebruikersnaam moet minstens 3 tekens zijn")
    .max(50)
    // "@" is reserved for logging in with an e-mail address.
    .refine((v) => !v.includes("@"), "Een gebruikersnaam mag geen @ bevatten"),
  email: emailSchema,
  password: z
    .string()
    .min(10, "Wachtwoord moet minstens 10 tekens zijn")
    .max(200),
  role: roleSchema,
});
export type CreateUserInput = z.input<typeof createUserSchema>;

/** PATCH /api/users/:id — role and/or e-mail (no defaults: omitted = unchanged). */
export const updateUserSchema = z
  .object({ role: roleSchema.optional(), email: emailSchema.optional() })
  .refine((v) => v.role !== undefined || v.email !== undefined, "Niets om aan te passen");
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export interface UserDto {
  id: number;
  username: string;
  email: string;
  role: RoleValue;
  totpEnabledAt: string | null;
  createdAt: string;
}

export function toUserDto(user: {
  id: number;
  username: string;
  email: string;
  role: string;
  totpEnabledAt: Date | null;
  createdAt: Date;
}): UserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role as RoleValue,
    totpEnabledAt: user.totpEnabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
