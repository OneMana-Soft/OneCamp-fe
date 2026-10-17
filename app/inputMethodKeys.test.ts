import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

/**
 * A text field's Enter and Escape wait for an input method (lib/keys/ime.ts).
 *
 * Typing Japanese, Chinese or Korean, Enter picks the word being made and
 * Escape drops it; neither is the field's. A field that acted on them sent an
 * invite to whoever was highlighted, moved a page, used a template, saved a
 * caption half made or cleared a search while someone was still choosing a
 * word. ProseMirror keeps an input method's keys from the editor's own key
 * handlers; a field of our own (an <input>, a <textarea>, or one made in
 * code) must ask isComposingKey itself, a React field through the one wrapper,
 * fieldKeyDown (lib/keys/ime.ts). The sweep of 14 Oct 2026 caught some;
 * the review of 15 Oct found 63 more fields across the app.
 *
 * Read from the source: a field whose keydown handler acts on "Enter" or
 * "Escape" and never asks isComposingKey (or isComposing, or keyCode 229), nor
 * is wrapped in fieldKeyDown.
 * The docs, editor and sharing surfaces hold none; elsewhere the count may
 * fall, and a rise fails, so a new field has to wait for the input method.
 */
const root = resolve(__dirname, "..")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** The balanced {…} block that starts at s[i], strings and templates skipped. */
function block(s: string, i: number): string {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '"' || c === "'" || c === "`") {
      const q = c
      for (j++; j < s.length && s[j] !== q; j++) if (s[j] === "\\") j++
    } else if (c === "{") depth++
    else if (c === "}" && --depth === 0) return s.slice(i, j + 1)
  }
  return s.slice(i)
}

/** A JSX element's attributes: from its "<" to the ">" that ends the tag, outside braces and strings. */
function attributes(s: string, start: number): string {
  let depth = 0
  for (let j = start + 1; j < s.length; j++) {
    const c = s[j]
    if (c === '"' || c === "'" || c === "`") {
      const q = c
      for (j++; j < s.length && s[j] !== q; j++) if (s[j] === "\\") j++
    } else if (c === "{") depth++
    else if (c === "}") depth--
    else if (c === ">" && depth === 0) return s.slice(start, j)
  }
  return s.slice(start)
}

/** A handler's body: inline, or a function of that name declared in the file. */
function handlerBody(s: string, handler: string): string {
  const named = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(handler)
  if (!named) return handler
  const decl = new RegExp(`(?:const|let|function)\\s+${named[1]}\\b`).exec(s)
  if (!decl) return handler
  const brace = s.indexOf("{", s.indexOf(decl[0].startsWith("function") ? ")" : "=>", decl.index))
  return brace < 0 ? handler : block(s, brace)
}

const ACTS = /["'](Enter|Escape)["']/
const WAITS = /isComposingKey|isComposing|keyCode\s*===?\s*229|fieldKeyDown\(/
const NOT_TEXT = /\btype=["'](checkbox|radio|range|color|file|button|submit|hidden|reset|image)["']/

/** "file:line" for each text field whose keydown acts on Enter or Escape without waiting for an input method. */
function fieldsThatDontWait(): string[] {
  const out: string[] = []
  for (const file of ["app", "components", "lib", "hooks"].flatMap((d) => walk(join(root, d)))) {
    const s = readFileSync(file, "utf8")
    const at = (i: number) => `${relative(root, file)}:${s.slice(0, i).split("\n").length}`
    for (const m of s.matchAll(/<(input|textarea|Input|Textarea)\b/g)) {
      const attrs = attributes(s, m.index!)
      if (NOT_TEXT.test(attrs)) continue
      const k = attrs.indexOf("onKeyDown={")
      if (k < 0) continue
      const body = handlerBody(s, block(attrs, k + "onKeyDown=".length))
      if (ACTS.test(body) && !WAITS.test(body)) out.push(at(m.index!))
    }
    // A field made in code: an input or a textarea given a keydown listener.
    for (const m of s.matchAll(/(\w+)\.addEventListener\(\s*["']keydown["']\s*,/g)) {
      if (!new RegExp(`\\b${m[1]}\\s*=\\s*(document\\.createElement|el)\\(\\s*["'](input|textarea)["']`).test(s)) continue
      const body = block(s, s.indexOf("{", m.index! + m[0].length))
      if (ACTS.test(body) && !WAITS.test(body)) out.push(at(m.index!))
    }
  }
  return out
}

/** Where none may be: the docs, the editor, and sharing. */
const NONE_IN = [
  "components/doc/",
  "components/docComments/",
  "components/docEditor/",
  "components/docTemplates/",
  "components/docTree/",
  "components/minimal-tiptap/",
  "components/threads/",
  "components/views/DocView.tsx",
  "components/dialog/docShareDialog.tsx",
  "components/dialog/shareParts.tsx",
  "app/app/doc/",
]

/**
 * Fields elsewhere that still act on an input method's keys: 57 on 15 Oct 2026,
 * once the docs, editor and sharing were fixed; 43 once fourteen task and
 * project fields took fieldKeyDown (16 Oct); 38 with the tables fixes (17d);
 * 37 once the calendar's Go to took it (TABLES-A2's 58a2a68a1, carried ahead).
 * Admin, AI composers, boards, channels, six table fields, the
 * task panel's InlineEdit (fixed on rv-shell-fe-2026-10-15-projects) and
 * pickers; the test's message lists them. Lower it as they are fixed; never
 * raise it.
 */
const ELSEWHERE_BASELINE = 37

describe("an input method's Enter and Escape", () => {
  const found = fieldsThatDontWait()

  it("finds the fields it reads (the check reads what it means to)", () => {
    // A field fixed in this sweep reads as waiting; one that never handles Enter isn't counted.
    expect(found.some((f) => f.startsWith("components/dialog/shareParts.tsx"))).toBe(false)
    expect(found.length).toBeGreaterThan(0)
  })

  it("are left to it in every docs, editor and sharing field", () => {
    expect(found.filter((f) => NONE_IN.some((p) => f.startsWith(p)))).toEqual([])
  })

  it("are left to it in more fields elsewhere, never fewer", () => {
    const elsewhere = found.filter((f) => !NONE_IN.some((p) => f.startsWith(p)))
    expect(elsewhere.length, `fields that act on an input method's Enter or Escape:\n${elsewhere.join("\n")}`).toBeLessThanOrEqual(ELSEWHERE_BASELINE)
  })
})
