import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { SourceMark } from "@/components/admin/connectParts"
import { importProviderLabel, type ImportProvider } from "@/services/importService"

afterEach(cleanup)

// Every tool the importer takes; the type makes a new one a gap here.
const PROVIDERS: Record<ImportProvider, true> = {
  airtable: true,
  asana: true,
  basecamp: true,
  clickup: true,
  csv: true,
  gsheets: true,
  jira: true,
  linear: true,
  miro: true,
  monday: true,
  notion: true,
  todoist: true,
  trello: true,
}

describe("an import source's mark", () => {
  // DESIGN-BUILD-11's I1: the sources wore grey letter tiles, two of them "A",
  // so a card told no tool from another but by its name.
  it("is coloured, and no two sources share one", () => {
    const sources = [...(Object.keys(PROVIDERS) as ImportProvider[]).map((p) => ({ vendor: p, name: importProviderLabel(p) })), { vendor: "slack", name: "Slack" }]
    const marks = sources.map(({ vendor, name }) => {
      const { container } = render(<SourceMark vendor={vendor} name={name} />)
      const mark = container.querySelector<HTMLElement>("[data-source-mark]")!
      return { vendor, hue: mark.dataset.hue, face: mark.textContent }
    })
    for (const m of marks) expect(m.hue, `${m.vendor} wears a hue`).toBeTruthy()
    const seen = new Map<string, string>()
    for (const m of marks) {
      const key = `${m.hue} ${m.face}`
      expect(seen.get(key), `${m.vendor}'s mark is ${seen.get(key)}'s`).toBeUndefined()
      seen.set(key, m.vendor)
    }
  })

  it("stays ink for a vendor that names no import source", () => {
    const { container } = render(<SourceMark vendor="github" name="GitHub" />)
    expect(container.querySelector<HTMLElement>("[data-source-mark]")!.dataset.hue).toBeUndefined()
  })
})
