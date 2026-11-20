// groupSelectors: a PostCSS plugin that runs after @tailwindcss/postcss and rewrites
// Tailwind v4's group-* and peer-* variant selectors into plain combinators.
//
//   .group-hover\:flex:is(:where(.group):hover *)   ->  :where(.group):hover .group-hover\:flex
//   .peer-checked\:block:is(:where(.peer):checked ~ *) ->  :where(.peer):checked ~ .peer-checked\:block
//
// Why: Blink cannot pull a descendant feature out of `:is(... *)`. A :hover or
// :focus-visible change on a .group row then marks the row's whole subtree as
// "might be invalid" and restyles every element in it. With a plain descendant
// combinator Blink invalidates only the elements that carry the variant class.
//
// The two forms match the same elements: `X:is(A *)` is an X with an A ancestor,
// which is what `A X` says (and `X:is(A ~ *)` is `A ~ X`). The plugin rewrites only
// that exact shape and leaves every other selector as it is:
//   - the selector is one compound (no combinator of its own) holding exactly one
//     `:is(<complex> *)` or `:is(<complex> ~ *)`, and no pseudo-element before it;
//   - <complex> is one selector (no comma) with no pseudo-element and no `&`;
//   - moving <complex> out of :is() loses :is()'s forgiving parsing, so every
//     pseudo-class in it outside a nested :is()/:where() must be one that every
//     browser Tailwind v4 supports can parse (else an unknown one would drop the
//     whole rule there);
//   - the rewritten selector has the same specificity as the original;
//   - a rule inside another rule or inside @scope is read relative to it, so it is
//     rewritten only when the compound itself holds `&`: `.a{.x:is(.g *)}` is
//     `.a .x:is(.g *)` (.g anywhere above .x), but `.a{.g .x}` would be `.a .g .x`.
// Rules in @media and other wrappers keep their wrappers; only selectors change.

import selectorParser from "postcss-selector-parser"

// Pseudo-classes that Safari 16.4, Chrome 111 and Firefox 128 (Tailwind v4's floor) all parse.
const SAFE_PSEUDO_CLASSES = new Set([
  ":active", ":any-link", ":checked", ":default", ":defined", ":disabled", ":empty", ":enabled",
  ":first-child", ":first-of-type", ":focus", ":focus-visible", ":focus-within", ":has", ":hover",
  ":in-range", ":indeterminate", ":invalid", ":is", ":lang", ":last-child", ":last-of-type", ":link",
  ":modal", ":not", ":nth-child", ":nth-last-child", ":nth-last-of-type", ":nth-of-type", ":only-child",
  ":only-of-type", ":optional", ":out-of-range", ":placeholder-shown", ":read-only", ":read-write",
  ":required", ":root", ":scope", ":target", ":valid", ":visited", ":where",
])
// Single-colon spellings that are pseudo-elements.
const LEGACY_PSEUDO_ELEMENTS = new Set([":before", ":after", ":first-line", ":first-letter"])
// Pseudo-classes whose argument is a selector list and is parsed forgivingly.
const FORGIVING = new Set([":is", ":where"])
// Pseudo-classes whose argument is a selector list and is NOT parsed forgivingly.
const SELECTOR_ARGS = new Set([":not", ":has"])

const lower = (value) => String(value).toLowerCase()
const isPseudoElement = (node) =>
  node.type === "pseudo" && (node.value.startsWith("::") || LEGACY_PSEUDO_ELEMENTS.has(lower(node.value)))

/**
 * Specificity of one selector node (a Selector, or any node inside one) as [ids, classes, types],
 * or null when this function cannot tell (then the plugin leaves the rule alone).
 */
export function specificity(node) {
  const add = (a, b) => (a && b ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : null)
  const maxOf = (selectors) => {
    let best = [0, 0, 0]
    for (const s of selectors) {
      const sp = specificity(s)
      if (!sp) return null
      if (compare(sp, best) > 0) best = sp
    }
    return best
  }
  switch (node.type) {
    case "root":
      return node.nodes.length === 1 ? specificity(node.nodes[0]) : null
    case "selector":
      return node.nodes.reduce((acc, child) => add(acc, specificity(child)), [0, 0, 0])
    case "id":
      return [1, 0, 0]
    case "class":
    case "attribute":
      return [0, 1, 0]
    case "tag":
      return [0, 0, 1]
    case "universal":
    case "nesting":
    case "combinator":
      return [0, 0, 0]
    case "pseudo": {
      const name = lower(node.value)
      if (isPseudoElement(node)) return [0, 0, 1]
      if (name === ":where") return [0, 0, 0]
      if (name === ":is" || name === ":not" || name === ":has") return maxOf(node.nodes)
      // `:nth-child(An+B of S)` adds S's specificity: not worth modelling here.
      if ((name === ":nth-child" || name === ":nth-last-child") && / of /i.test(String(node))) return null
      return [0, 1, 0]
    }
    default:
      return null
  }
}

function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/** True when every pseudo-class in `nodes` outside a nested :is()/:where() is on the safe list. */
function parsesEverywhere(nodes) {
  for (const node of nodes) {
    if (node.type === "comment" || node.type === "nesting") return false
    if (node.type !== "pseudo") continue
    if (isPseudoElement(node)) return false
    const name = lower(node.value)
    if (FORGIVING.has(name)) continue
    if (!SAFE_PSEUDO_CLASSES.has(name)) return false
    if (SELECTOR_ARGS.has(name) && !node.nodes.every((s) => parsesEverywhere(s.nodes))) return false
  }
  return true
}

/**
 * Finds the one `:is(<complex> *)` / `:is(<complex> ~ *)` in a single-compound selector and returns
 * { pseudo, complex, combinator } or null when the selector is not that exact shape.
 */
function findShape(selector) {
  const nodes = selector.nodes
  if (nodes.some((n) => n.type === "combinator" || n.type === "comment")) return null
  let found = null
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.type !== "pseudo" || lower(node.value) !== ":is") continue
    const shape = shapeOf(node)
    if (!shape) continue
    if (found) return null // two group/peer variants on one class: leave it
    if (nodes.slice(0, i).some(isPseudoElement)) return null
    found = shape
  }
  return found
}

function shapeOf(pseudo) {
  if (pseudo.nodes.length !== 1) return null // a list inside :is()
  const inner = pseudo.nodes[0].nodes
  const n = inner.length
  if (n < 3) return null
  const last = inner[n - 1]
  const comb = inner[n - 2]
  if (last.type !== "universal" || last.value !== "*" || last.namespace) return null
  if (comb.type !== "combinator") return null
  const kind = comb.value.trim()
  if (kind !== "" && kind !== "~") return null
  const complex = inner.slice(0, n - 2)
  if (complex[0].type === "combinator") return null
  if (!parsesEverywhere(complex)) return null
  return { pseudo, complex, combinator: kind === "~" ? " ~ " : " " }
}

/**
 * Rewrites one selector string; returns the new string, or null to leave it unchanged.
 * `relative`: the selector sits in a rule nested in a rule or in @scope (see isRelative).
 */
export function rewriteSelector(text, { relative = false } = {}) {
  if (text.includes("/*")) return null // the parser folds comments into combinators
  let root
  try {
    root = selectorParser().astSync(text)
  } catch {
    return null
  }
  if (root.nodes.length !== 1) return null
  const selector = root.nodes[0]
  // Without its own `&` a nested selector is relative to its parent: the group would move inside it.
  if (relative && !selector.nodes.some((n) => n.type === "nesting")) return null
  const shape = findShape(selector)
  if (!shape) return null
  const complex = shape.complex.map(String).join("").trim()
  const compound = selector.nodes.filter((n) => n !== shape.pseudo).map(String).join("").trim() || "*"
  const out = `${complex}${shape.combinator}${compound}`
  let after
  try {
    after = selectorParser().astSync(out)
  } catch {
    return null
  }
  const before = specificity(root)
  const now = specificity(after)
  if (!before || !now || compare(before, now) !== 0) return null
  return out
}

/** Rewrites every selector of one rule; returns the new selector text, or null when nothing changes. */
export function rewriteRuleSelector(text, options) {
  let root
  try {
    root = selectorParser().astSync(text)
  } catch {
    return null
  }
  let changed = false
  const parts = root.nodes.map((selector) => {
    const own = String(selector).trim()
    const next = rewriteSelector(own, options)
    if (next === null) return own
    changed = true
    return next
  })
  return changed ? parts.join(",") : null
}

/** True when a rule's selectors are read relative to an outer rule or an @scope root. */
function isRelative(rule) {
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === "rule") return true
    if (node.type === "atrule" && lower(node.name) === "scope") return true
  }
  return false
}

const plugin = () => ({
  postcssPlugin: "onecamp-group-selectors",
  OnceExit(root) {
    root.walkRules((rule) => {
      if (!rule.selector.includes(":is(")) return
      const parent = rule.parent
      if (parent && parent.type === "atrule" && /keyframes$/i.test(parent.name)) return
      const next = rewriteRuleSelector(rule.selector, { relative: isRelative(rule) })
      if (next !== null) rule.selector = next
    })
  },
})
plugin.postcss = true

export default plugin
