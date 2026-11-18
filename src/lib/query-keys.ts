/**
 * React Query keys to refresh after a todo was edited (TodoEditDialog), shared
 * by the planning page and the Dagplanning so both show fresh data:
 * the blocks (appointments carry title, checklist and resources of the todo),
 * the todo lists (sidebar) and the todo detail itself.
 */
export function todoChangedQueryKeys(todoId: number): readonly (readonly unknown[])[] {
  return [["appointments"], ["todos"], ["todo", todoId]] as const;
}
