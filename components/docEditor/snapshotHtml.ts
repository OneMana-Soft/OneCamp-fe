import { sanitizeRichHtml } from "@/lib/sanitizeHtml"

/**
 * A doc's saved HTML, made safe and dressed the way the live editor dresses
 * the same blocks, for the read-only copy shown until the live document
 * arrives (docInput.tsx).
 *
 * The editor gives each block a class (use-minimal-tiptap.ts: a paragraph is
 * "text-node", a list "list-node", a heading "heading-node"; docInput.tsx: a
 * checklist "task-list" and "task-item") and its spacing hangs on those
 * classes. The saved HTML has none of them, so the copy lost 4px under every
 * paragraph and list and the whole page jumped when the editor took over (a
 * 0.11 layout shift opening the Q4 launch plan). A checklist item also gets
 * the editor's shape: a box where the checkbox goes, its text beside it.
 *
 * docSnapshot.test.ts holds these classes to the editor's configuration.
 */
export const SNAPSHOT_CLASSES: readonly (readonly [selector: string, className: string])[] = [
  ["p", "text-node"],
  ["h1, h2, h3, h4, h5, h6", "heading-node"],
  ["blockquote", "block-node"],
  ["pre", "block-node"],
  ['ul[data-type="taskList"]', "task-list"],
  ['li[data-type="taskItem"]', "task-item"],
  ['ul:not([data-type="taskList"]), ol', "list-node"],
]

export function snapshotHtml(html: string): string {
  const safe = sanitizeRichHtml(html)
  if (!safe || typeof document === "undefined") return safe
  const root = document.createElement("template")
  root.innerHTML = safe
  const content = root.content
  for (const [selector, className] of SNAPSHOT_CLASSES) {
    content.querySelectorAll(selector).forEach((el) => el.classList.add(className))
  }
  // A checklist item as the editor draws it: a label holding the box, then
  // the item's text in a div (the CSS for both is the editor's own).
  content.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
    const label = document.createElement("label")
    label.setAttribute("aria-hidden", "true")
    const box = document.createElement("span")
    box.className = "doc-snapshot-check"
    label.appendChild(box)
    const body = document.createElement("div")
    while (li.firstChild) body.appendChild(li.firstChild)
    li.append(label, body)
  })
  return root.innerHTML
}
