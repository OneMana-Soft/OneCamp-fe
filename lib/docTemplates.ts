import type { CampHue } from "@/lib/campHue"

/**
 * The three ways to start a doc besides a blank page (content.md D03): each a
 * title, a hue for its tile and the opening body. A new doc from one is made
 * "Untitled"-style (private, opened at once) under the template's name, and
 * opens with ?template=<id>, so the editor can lay the body into an empty doc
 * on its first load. The doc API takes only a title and privacy, so the body
 * travels this way rather than in the create call.
 */
export interface DocTemplate {
  id: "meeting-notes" | "project-brief" | "decision-record"
  name: string
  hue: CampHue
  /** The body as HTML, in the editor's own blocks. */
  body: string
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: "meeting-notes",
    name: "Meeting notes",
    hue: "sky",
    body:
      "<p><strong>Attendees:</strong> </p><h2>Agenda</h2><ul><li><p></p></li></ul><h2>Decisions</h2><ul><li><p></p></li></ul><h2>Actions</h2><ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\"><p></p></li></ul>",
  },
  {
    id: "project-brief",
    name: "Project brief",
    hue: "sun",
    body:
      "<h2>Why</h2><p></p><h2>What we will ship</h2><ul><li><p></p></li></ul><h2>Who</h2><p></p><h2>When</h2><p></p><h2>Risks</h2><ul><li><p></p></li></ul>",
  },
  {
    id: "decision-record",
    name: "Decision record",
    hue: "dusk",
    body:
      "<p><strong>Status:</strong> Proposed</p><h2>Context</h2><p></p><h2>Options</h2><ol><li><p></p></li></ol><h2>Decision</h2><p></p><h2>Consequences</h2><p></p>",
  },
]

export function docTemplate(id: string | null | undefined): DocTemplate | undefined {
  return DOC_TEMPLATES.find((t) => t.id === id)
}
