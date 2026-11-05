// The shapes a sensitivity label travels in (miro-44 L). Types only, so a page
// that imports them (with `import type`) loads nothing for them.

import type { AxiosInstance } from "axios"

/** The kinds of item that carry a label. */
export type LabelKind = "board" | "doc"

/** A label as the server sends it. `colour` is a palette name (lib/taskStatus STORED_NAME). */
export interface SensitivityLabel {
  id: string
  name: string
  colour: string
  rank: number
  rules: string[]
}

/** A rule a label can carry, in the admin card's order, with its name ("No guest links"). */
export interface LabelRule {
  key: string
  name: string
}

/** GET /labels: the workspace's labels and every rule a label can carry. */
export interface LabelCatalogue {
  labels: SensitivityLabel[]
  rules: LabelRule[]
}

/** The calls labels make (axiosInstance in the app, a stub in tests). */
export type LabelHttp = Pick<AxiosInstance, "get" | "post" | "patch" | "put">

/** The workspace's labels as a picker shows them, read once it opens. */
export interface LabelCatalogueRead {
  catalogue: LabelCatalogue | null
  loading: boolean
  failed: boolean
  retry(): void
}

/**
 * One item's label as its page holds it (components/labels/labelData's
 * useLabelling), passed to the lazy chip and picker, which only present.
 */
export interface Labelling {
  kind: LabelKind
  label: SensitivityLabel | null
  labels: LabelCatalogueRead
  /** Puts a label on (an id) or takes it off (null); throws the server's refusal for the picker to say. */
  save(labelId: string | null): Promise<void>
}
