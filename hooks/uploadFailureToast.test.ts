import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A file that failed to upload raised "Error" over "error while uploading
// file: notes.pdf", which named the machinery and not the reason. It now says
// which file didn't upload, and why in the server's words (apiErrorMessage).
describe("a file that fails to upload", () => {
  const src = readFileSync(join(__dirname, "useUploadFile.ts"), "utf8")

  it("is named in the toast's title, with the reason under it", () => {
    expect(src).not.toMatch(/error while uploading file/)
    expect(src).not.toMatch(/title:\s*"Error"/)
    expect((src.match(/title: `Couldn't upload \$\{file\.name\}`/g) || []).length).toBeGreaterThan(0)
    expect(src).toMatch(/description: apiErrorMessage\(error, /)
  })
})
