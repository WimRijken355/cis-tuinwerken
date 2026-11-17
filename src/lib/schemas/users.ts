import { z } from "zod";

/** Contracts for /api/users (user management — ADMIN-only, see requireAdmin()). */

export const roleSchema = z.enum(["ADMIN", "SUPERUSER"]);
export type RoleValue = z.infer<typeof roleSchema>;

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Gebruikersnaam moet minstens 3 tekens zijn")
    .max(50),
  password: z
    .string()
    .min(10, "Wachtwoord moet minstens 10 tekens zijn")
    .max(200),
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserRoleSchema = z.object({
  role: roleSchema,
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export interface UserDto {
  id: number;
  username: string;
  role: RoleValue;
  totpEnabledAt: string | null;
  createdAt: string;
}

export function toUserDto(user: {
  id: number;
  username: string;
  role: string;
  totpEnabledAt: Date | null;
  createdAt: Date;
}): UserDto {
  return {
    id: user.id,
    username: user.username,
    role: user.role as RoleValue,
    totpEnabledAt: user.totpEnabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
