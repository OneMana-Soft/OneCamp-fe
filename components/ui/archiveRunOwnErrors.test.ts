import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Running an archive now says a refusal inside its dialog, which stays open
// to say it. The request also raised the global error toast, so the same
// refusal was said twice, once over the dialog that was saying it.
describe("running an archive", () => {
  it("tells the global error toast that the dialog speaks for it", () => {
    const src = readFileSync(join(__dirname, "UnifiedUIManager.tsx"), "utf8")
    const block = src.slice(src.indexOf("<ArchiveRunJobDialog"), src.indexOf("/>", src.indexOf("entityType={ui.archiveRunJob")))
    expect(block).toMatch(/axios\.post\(`\$\{PostEndpointUrl\.RunArchiveJob\}\/\$\{entityType\}`, undefined, OWN_ERRORS\)/)
  })
})
