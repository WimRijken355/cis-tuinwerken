/**
 * Pure guard logic for user management: prevents a role change or deletion
 * from leaving the app without a single ADMIN (which would lock everyone
 * out of user management and the audit trail).
 */
export function wouldRemoveLastAdmin(params: {
  adminCount: number;
  targetIsCurrentlyAdmin: boolean;
  targetWillBeAdmin: boolean;
}): boolean {
  const { adminCount, targetIsCurrentlyAdmin, targetWillBeAdmin } = params;
  return targetIsCurrentlyAdmin && !targetWillBeAdmin && adminCount <= 1;
}
