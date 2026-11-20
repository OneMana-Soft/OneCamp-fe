/**
 * The group variants under a root that have no group to answer to. Tailwind's
 * group-hover:, group-focus-within:, group-data-[state=open]/date: and the
 * like style an element by an ANCESTOR that carries `group` (or, named,
 * `group/date`); with no such ancestor where the element is drawn, the
 * variant never applies, and a control hidden until it does stays hidden.
 *
 * V-957: a link cell's "Add a link" showed on a grid row's hover (the row is
 * `group`), and the same cell in a row's record had no group above it, so a
 * mouse never saw or reached it there. A test that draws shared markup in a
 * context of its own checks every variant in it has its group:
 *
 *   expect(groupsWithout(document.body)).toEqual([])
 *
 * Each finding names the element's tag (and its label, when it has one), a
 * variant it has with no group, and the start of its classes. An element's
 * own `group` doesn't count: a group variant answers to an ancestor only.
 */
export function groupsWithout(root: Element): string[] {
  const found: string[] = []
  for (const el of root.querySelectorAll("[class]")) {
    // An SVG's className is not a string: its class attribute is.
    const classes = el.getAttribute("class") ?? ""
    const label = el.getAttribute("aria-label")
    const missing = new Set<string>()
    for (const m of classes.matchAll(VARIANT)) {
      const name = m[1]
      const group = name ? `[class~="group/${name}"]` : '[class~="group"]'
      if (!el.parentElement?.closest(group)) missing.add(`${m[0].replace(/^[\s:]/, "")} with no ${name ? `group/${name}` : "group"} above it`)
    }
    // row-hover-in: (app/globals.css) answers to a list row, [data-task-id], as group-hover/row: did to its group.
    if (ROW_VARIANT.test(classes) && !el.parentElement?.closest("[data-task-id]")) missing.add("row-hover-in: with no [data-task-id] row above it")
    for (const what of missing) found.push(`<${el.tagName.toLowerCase()}>${label ? ` "${label}"` : ""} ${what}: ${classes.slice(0, 80)}`)
  }
  return found
}

const ROW_VARIANT = /(?:^|[\s:])row-hover-in:/

/** group-<state>[<arbitrary>][/<name>]: as a class token or after another variant. */
const VARIANT = /(?:^|[\s:])group-[a-z-]+(?:\[[^\]\s]*\])?(?:\/([\w-]+))?:/g
