import { dialogFor } from "@/components/docEditor/registry/registry"
import type { DocCommandBus } from "@/components/docEditor/registry/types"

/**
 * Asking the doc's pickers for a choice (docs C1): a project, to make a task
 * in or to show the tasks or board of, or a page to link. The command that
 * asks waits for the answer; the dialog takes the question as it opens
 * (takePick) and answers once, with null when it closes without a choice.
 */

export interface Picked {
  id: string
  name: string
}

/** What a project is picked for: the dialog's words, and which projects it offers. */
export type ProjectPurpose = "task" | "tasks" | "board"

export const PICK_PROJECT = "connected.pickProject"
export const PICK_PAGE = "connected.pickPage"

interface Question {
  dialog: typeof PICK_PROJECT | typeof PICK_PAGE
  purpose?: ProjectPurpose
  answer(p: Picked | null): void
}

let asked: Question | null = null

function ask(bus: DocCommandBus | undefined, dialog: Question["dialog"], purpose?: ProjectPurpose): Promise<Picked | null> {
  // No doc page to open it on (a guest's page has none): nothing is chosen.
  if (!bus?.docId || !dialogFor(dialog, { ai: false })) return Promise.resolve(null)
  return new Promise((resolve) => {
    asked?.answer(null)
    asked = { dialog, purpose, answer: resolve }
    bus.emit("openDialog", { id: dialog })
  })
}

export const pickProject = (bus: DocCommandBus | undefined, purpose: ProjectPurpose) => ask(bus, PICK_PROJECT, purpose)

export const pickPage = (bus: DocCommandBus | undefined) => ask(bus, PICK_PAGE)

/** The question a picker dialog answers, taken once as it opens. */
export function takePick(dialog: Question["dialog"]): Question | null {
  if (asked?.dialog !== dialog) return null
  const q = asked
  asked = null
  return q
}
