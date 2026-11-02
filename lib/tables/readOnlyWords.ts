// A view-only table's words (V-170), with no imports: the range's piece reads them (app/firstLoad.test.ts).

/** What a write refused to a reader who may only view the table says: the server's words (ReadOnlyWords). */
export const READ_ONLY_WORDS = "You can view this table"
/** Why, in a line. */
export const EDITORS_CHOSEN = "Its owner chooses who edits it."
/** Under the table's name, for a reader who may only view it. */
export const VIEW_ONLY_WHY = `You can view and comment on this table. ${EDITORS_CHOSEN}`
