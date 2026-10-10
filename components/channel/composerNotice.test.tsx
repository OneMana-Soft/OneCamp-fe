import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ComposerNotice } from "./composerNotice"

// Where nobody can write (archived, announcement-only), one notice: an icon
// beside its words, kept together when they wrap.
afterEach(cleanup)

describe("ComposerNotice", () => {
  it("keeps its icon beside its words", () => {
    const { container } = render(<ComposerNotice icon={<svg data-i="" />}>This channel is archived.</ComposerNotice>)
    const line = container.querySelector("[data-composer-notice] > p")!
    expect(line.className).toContain("inline-flex")
    expect(line.className).toContain("text-left")
    expect(line.querySelector("[data-i]")).toBeTruthy()
  })

  it.each(["components/channel/chanelIdDesktop.tsx", "components/channel/channelIdMobile.tsx"])(
    "is what %s draws for an archived or read-only channel",
    (f) => {
      const src = readFileSync(join(__dirname, "..", "..", f), "utf8")
      expect(src.match(/<ComposerNotice icon=/g)?.length).toBe(2)
      expect(src).not.toMatch(/text-center text-sm text-muted-foreground[^>]*>\s*This channel is archived/)
    },
  )
})
