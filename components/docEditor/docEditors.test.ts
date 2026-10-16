import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// Every editor that shows a doc's text is built by useDocEditor, from the block
// registry's blocks for a doc (registry/factory.ts). y-prosemirror deletes whatever
// its editor's schema can't hold from its copy of the shared document, so a
// doc surface built from a shorter list loses blocks, not just looks: the
// guest viewer once dropped every callout, toggle, to-do and table embed.
//
// The shared hook (useMinimalTiptapEditor) is still how the composers and the
// task description build theirs. A new caller has to be one of those, named
// here with its reason, or build through useDocEditor.

const root = join(__dirname, "..", "..")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const sources = [...walk(join(root, "app")), ...walk(join(root, "components"))].map((file) => ({
  file: relative(root, file),
  src: readFileSync(file, "utf8"),
}))

/** Editors that never hold a doc's body, each with why. */
const NOT_DOCS: Record<string, string> = {
  "components/textInput/textInput.tsx": "the chat composers, comment boxes and message previews",
  "components/task/QuietEditor.tsx": "a task's description",
  "components/docComments/CommentComposer.tsx": "a doc comment's composer (B7): a comment, never the doc's body",
}

/** The one place a doc's editor is made. */
const FACTORY = "components/docEditor/useDocEditor.ts"

describe("editors that show a doc", () => {
  it("are built by useDocEditor; the shared hook's other callers hold no doc", () => {
    const callers = sources.filter(({ src }) => /\buseMinimalTiptapEditor\s*\(/.test(src)).map(({ file }) => file)
    const unexplained = callers.filter((file) => file !== FACTORY && !(file in NOT_DOCS))
    expect(unexplained, "build a doc's editor with useDocEditor (or name a non-doc editor in NOT_DOCS)").toEqual([])
  })

  it("include the doc page, its read-only copy and the guest's shared page", () => {
    for (const file of ["components/docEditor/docInput.tsx", "components/guest/GuestDocViewer.tsx"]) {
      const src = sources.find((s) => s.file === file)?.src ?? ""
      expect(src, file).toMatch(/\buseDocEditor\s*\(/)
      expect(src, file).not.toMatch(/\buseMinimalTiptapEditor\s*\(/)
      // Drawn in the doc's own type, not a message's.
      expect(src, file).toMatch(/DOC_EDITOR_CLASS/)
    }
  })

  it("any other surface that renders a doc's text uses the same factory", () => {
    // A version preview, a template preview, a print view: a component under
    // a doc folder (or named for a doc) that renders an editor.
    const docSurfaces = sources.filter(
      ({ file, src }) =>
        /(^|\/)(docEditor|guest|doc)\/|Doc[A-Z]?\w*\.tsx$|doc[A-Z]\w*\.tsx$/.test(file) &&
        /<EditorContent\b/.test(src) &&
        !(file in NOT_DOCS),
    )
    expect(docSurfaces.length).toBeGreaterThanOrEqual(2)
    for (const { file, src } of docSurfaces) expect(src, file).toMatch(/\buseDocEditor\s*\(/)
  })

  it("take the registry's blocks for a doc, never a list of their own", () => {
    const factory = sources.find((s) => s.file === FACTORY)?.src ?? ""
    expect(factory).toMatch(/kind:\s*guest \? "guest" : "doc"/)
    expect(factory).not.toMatch(/extraExtensions|slashCommands:/)
    // Nobody else hands the hook the doc's blocks piecemeal.
    for (const { file, src } of sources) {
      // The block registry's doc-only chunk is the one place they are listed (blocks/doc.ts loads it).
      if (file === "components/minimal-tiptap/blocks/docOnly.ts") continue
      expect(src, file).not.toMatch(/extensions\/callout\/callout['"]/)
      expect(src, file).not.toMatch(/extensions\/collapsible\/collapsible['"]/)
    }
  })
})
