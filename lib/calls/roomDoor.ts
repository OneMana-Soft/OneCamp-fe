// A room's door in this app, apart from lib/calls/joinTarget: a guest's room
// page (app/r/[slug]) writes it too, and joinTarget would bring the publish
// client into that page's first load.

/** A room's door in this app, where a member joins as themselves: the one way its path is written. Pure. */
export const roomDoorPath = (slug: string): string => `/app/meet/join/r/${encodeURIComponent(slug)}`
