/**
 * The relay's stamp on presence (the collaboration service's presenceGuard.js): each member's user carries edit,
 * true when the member list lets them edit, whatever their tab claimed (presence/people lists the fields). Only an
 * editor presents, holds everyone or brings everyone, so a tab honours those only from a state stamped so: a viewer's
 * tab may claim anything, but never the relay's stamp. Its own module, so a board's first load reads it without the
 * rest of presence/people.
 */
export const stampedEditor = (state: unknown): boolean => {
  const user = (state as { user?: unknown } | null | undefined)?.user
  return typeof user === "object" && user !== null && (user as { edit?: unknown }).edit === true
}
