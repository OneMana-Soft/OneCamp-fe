import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
/**
 * Every cva variant axis a primitive declares must actually be forwarded to the
 * cva function.
 *
 * This exists because of a real mistake. Adding `size` and `caps` to Badge while
 * leaving its signature as `({ className, variant, ...props })` produced a
 * component that type-checked, accepted `size="sm"`, rendered without error, and
 * silently ignored the prop — then spread it onto the <span> as an invalid DOM
 * attribute. Nothing in review catches that: the types are satisfied because
 * VariantProps derives them from the cva config, not from the destructure, and
 * the output still looks like a badge.
 *
 * The failure mode is specific and quiet. A caller asks for a dense uppercase
 * tag, gets the default size, and the design drift the variant was added to fix
 * carries on with a green suite. So this is checked structurally rather than
 * per-component: any primitive can grow an axis, and it will be held to this
 * without anyone remembering to write a test.
 */
const UI_DIR = resolve(__dirname)
/**
 * Axis names declared in a `variants: { ... }` block. Matched at the indentation
 * cva configs use in this codebase; a nested object inside an axis is deeper and
 * so is not mistaken for an axis itself.
 */
const AXIS = /^\s{6}([A-Za-z_]\w*):\s*\{/gm
/** Anything of the shape `somethingVariants({ a, b })`. */
const FORWARDED = /Variants\(\{([^}]*)\}\)/g
function variantsBlock(source: string): string | null {
  const start = source.search(/^\s{4}variants:\s*\{/m)
  if (start === -1) return null
  // The block ends at the first 4-space-indented closing brace after it, which
  // is where cva configs close `variants` before `defaultVariants`.
  const rest = source.slice(start)
  const end = rest.search(/^\s{4}\},/m)
  return end === -1 ? rest : rest.slice(0, end)
}
describe("cva primitives forward every variant axis they declare", () => {
  const files = readdirSync(UI_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => resolve(UI_DIR, f))
    .filter((f) => readFileSync(f, "utf8").includes("cva("))

  it("finds the cva primitives to check, so this cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it.each(files.map((f) => [f.slice(UI_DIR.length + 1), f]))(
    "%s forwards all of its axes",
    (_name, file) => {
      const source = readFileSync(file as string, "utf8")
      const block = variantsBlock(source)
      if (!block) return // cva used without a variants map; nothing to forward.
      const axes = [...block.matchAll(AXIS)].map((m) => m[1])
      if (axes.length === 0) return
      const forwarded = new Set<string>()
      for (const m of source.matchAll(FORWARDED)) {
        for (const ident of m[1].matchAll(/[A-Za-z_]\w*/g)) forwarded.add(ident[0])
      }
      const missing = axes.filter((a) => !forwarded.has(a))
      expect(
        missing,
        `declared but never passed to the cva function, so setting it does ` +
          `nothing and it leaks to the DOM: ${missing.join(", ")}`,
      ).toEqual([])
    },
  )
})
