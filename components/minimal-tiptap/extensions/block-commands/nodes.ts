// B1's schema names, shared by the static spec (register.ts) and the editor's
// extensions. The collaboration service's schema/{indent,blockDir,columns}.js
// name the same nodes.

/** The blocks Tab nests: an outline indent, 0–8. */
export const INDENT_NODES = ["blockquote", "bulletList", "callout", "chartEmbed", "codeBlock", "collapsible", "diffEmbed", "heading", "horizontalRule", "image", "orderedList", "paragraph", "poll", "recordingEmbed", "tableEmbed", "taskList"]

/** The blocks with a text direction of their own (null: from their text). */
export const DIR_NODES = ["blockquote", "bulletList", "callout", "collapsible", "heading", "orderedList", "paragraph", "taskList"]

export const MAX_INDENT = 8

/** Columns: a row of 2–4, each holding blocks. */
export const COLUMN_LIST = "columnList"
export const COLUMN = "column"
export const MAX_COLUMNS = 4
