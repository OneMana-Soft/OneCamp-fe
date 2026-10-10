import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { ConfirmAlertDialog } from "@/components/dialog/confirmAlertDialog"

afterEach(cleanup)

// useConfirm({ destructive: true }) stores the flag on the confirmAlert data,
// and UnifiedUIManager is the one place that renders that dialog. The flag was
// dropped there, so a "Delete channel" confirm drew the brand's orange button.
describe("destructive confirms", () => {
  it("UnifiedUIManager passes the data's destructive flag to the dialog", () => {
    const src = readFileSync(resolve(__dirname, "UnifiedUIManager.tsx"), "utf8")
    const block = src.slice(src.indexOf("<ConfirmAlertDialog"), src.indexOf("/>", src.indexOf("<ConfirmAlertDialog")))
    expect(block).toMatch(/destructive=\{ui\.confirmAlert\.data\.destructive/)
  })

  it("draws the confirm button in the danger colour when destructive", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Delete channel?" description="Its messages go too." confirmText="Delete channel" destructive />)
    expect(screen.getByRole("button", { name: "Delete channel" }).className).toContain("bg-destructive")
  })

  it("keeps the brand fill when not destructive", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Publish?" description="Everyone sees it." confirmText="Publish" />)
    const button = screen.getByRole("button", { name: "Publish" })
    expect(button.className).toContain("bg-primary")
    expect(button.className).not.toContain("bg-destructive")
  })
})
