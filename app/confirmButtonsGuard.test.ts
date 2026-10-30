import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// A confirm's buttons are Buttons (SHADCN-AUDIT SA-5): AlertDialogAction and
// AlertDialogCancel render <Button asChild>, and say how they look with
// variant (dangerSolid for a confirm that destroys) and size. They were
// Radix's bare buttons dressed in buttonVariants' classes, and seven confirms
// patched their own look on top: a danger-ink raised button, the old shadcn
// red, the brand's orange on a Delete. None may now: the baseline is none.

const ROOT = join(__dirname, "..")
const DIRS = ["app", "components"]
const PARTS = new Set(["AlertDialogAction", "AlertDialogCancel"])
/** A look of its own on a confirm's button: buttonVariants' classes, or a fill or text colour written by hand. */
const OWN_LOOK = /buttonVariants\(|dangerSolidClass|(?:^|\s)(?:hover:)?bg-(?:destructive|brand|primary|danger)\b|text-destructive-foreground/

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (entry.name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(entry.name)) out.push(path)
  }
  return out
}

/** A confirm's buttons in a file that dress themselves: "file:line". */
function dressed(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && PARTS.has(n.tagName.getText(sf))) {
      const cls = n.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "className")
      if (cls?.initializer && OWN_LOOK.test(cls.initializer.getText(sf))) out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return out
}

describe("a confirm's buttons", () => {
  it("are Buttons in the primitive", () => {
    const src = readFileSync(join(ROOT, "components/ui/alert-dialog.tsx"), "utf8")
    expect(src.match(/<Button asChild variant=\{[^}]*\} size=\{size\}/g)?.length, "AlertDialogAction and AlertDialogCancel render <Button asChild>").toBe(2)
  })

  it("say how they look with variant and size, never classes of their own", () => {
    const found = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== "components/ui/alert-dialog.tsx")
      .flatMap((f) => {
        const src = readFileSync(join(ROOT, f), "utf8")
        return /AlertDialog(Action|Cancel)/.test(src) ? dressed(f, src) : []
      })
    expect(found, 'give the confirm\'s button variant="dangerSolid" (a confirm that destroys) or a Button variant, not classes').toEqual([])
  })
})

describe("the rule's reading", () => {
  it("finds a confirm's button dressed by hand, and not one told its variant", () => {
    expect(dressed("x.tsx", `<AlertDialogAction className={buttonVariants({ variant: "destructive" })}>Delete</AlertDialogAction>`)).toEqual(["x.tsx:1"])
    expect(dressed("x.tsx", `<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>`)).toEqual(["x.tsx:1"])
    expect(dressed("x.tsx", `<AlertDialogCancel className={cn(buttonVariants({ variant: "ghost" }))}>Keep it</AlertDialogCancel>`)).toEqual(["x.tsx:1"])
    expect(dressed("x.tsx", `<AlertDialogAction variant="dangerSolid" className="relative">Delete</AlertDialogAction>`)).toEqual([])
    expect(dressed("x.tsx", `<Button className={buttonVariants({ variant: "destructive" })} />`)).toEqual([])
  })
})
