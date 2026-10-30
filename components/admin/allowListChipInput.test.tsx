import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { TooltipProvider } from "@/components/ui/tooltip"
import { AllowListChipInput } from "./AllowListChipInput"
import { EMBED_HOST_RULES } from "./allowListEntries"

// The chip field of Settings > Workspace's sign-up list and Settings > Docs'
// sites: a bad entry says why in words under the field, not only in a tip.

function Field({ start = [], refusal }: { start?: string[]; refusal?: string }) {
  const [value, setValue] = React.useState<string[]>(start)
  return (
    <TooltipProvider>
      <label htmlFor="sites">Sites</label>
      <AllowListChipInput id="sites" value={value} onChange={setValue} rules={EMBED_HOST_RULES} refusal={refusal} />
    </TooltipProvider>
  )
}

afterEach(cleanup)

describe("a chip field's problems", () => {
  it("says the first bad entry's reason in one line under the field, and the field names it", () => {
    render(<Field start={["wiki.acme.com"]} />)
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.change(screen.getByLabelText("Sites"), { target: { value: "not_a site, also bad " } })
    const line = screen.getByRole("alert")
    expect(line.textContent).toBe(EMBED_HOST_RULES.problem("not_a")!)
    expect(screen.getByLabelText("Sites").getAttribute("aria-describedby")).toContain(line.id)
    fireEvent.click(screen.getByRole("button", { name: "Remove not_a" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove site" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove also" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove bad" }))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("says a refusal in that line instead, rings the field, and tints only the entry it names", () => {
    render(<Field start={["wiki.acme.com", "acme.com", "intranet.local"]} refusal="intranet.local isn't a public site." />)
    expect(screen.getByRole("alert").textContent).toBe("intranet.local isn't a public site.")
    expect(document.querySelector("[data-chip-field]")?.getAttribute("data-invalid")).toBe("true")
    const tinted = Array.from(document.querySelectorAll("[data-allow-chip][data-invalid]")).map((c) => c.firstElementChild?.nextElementSibling?.textContent)
    expect(tinted).toEqual(["intranet.local"])
  })
})
