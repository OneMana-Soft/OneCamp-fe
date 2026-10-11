import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** The create composer's description has no toolbar at rest; formatting shows on a selection (work.md W36). */
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

describe("the create composer's description", () => {
  it("is the quiet editor, not the message composer with its toolbar", () => {
    const form = read("components/task/taskCreateForm.tsx")
    expect(form).toMatch(/<QuietEditor\b/)
    expect(form).not.toMatch(/components\/textInput\/textInput/)
  })

  it("formats from a toolbar over the selection only", () => {
    const editor = read("components/task/QuietEditor.tsx")
    expect(editor).toMatch(/<BubbleMenu\b/)
    expect(editor).toMatch(/from !== to/)
  })
})
