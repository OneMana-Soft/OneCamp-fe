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

  // "Cancel" beside "Cancel import" left the person to guess which button
  // stops the import. A confirm whose action is itself a cancel names the
  // safe button for what it keeps instead.
  it("UnifiedUIManager passes the data's cancel label to the dialog", () => {
    const src = readFileSync(resolve(__dirname, "UnifiedUIManager.tsx"), "utf8")
    const block = src.slice(src.indexOf("<ConfirmAlertDialog"), src.indexOf("/>", src.indexOf("<ConfirmAlertDialog")))
    expect(block).toMatch(/cancelText=\{ui\.confirmAlert\.data\.cancelText/)
  })

  it("useConfirm carries a cancel label through to the dialog's data", () => {
    const src = readFileSync(resolve(__dirname, "../../hooks/useConfirm.ts"), "utf8")
    expect(src).toMatch(/cancelText\?: string/)
    expect(src).toMatch(/cancelText: opts\.cancelText/)
  })

  it("names the safe button when asked", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Cancel this import?" description="What has come over stays." confirmText="Cancel import" cancelText="Keep importing" destructive />)
    expect(screen.getByRole("button", { name: "Keep importing" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })

  it("keeps the brand fill when not destructive", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Publish?" description="Everyone sees it." confirmText="Publish" />)
    const button = screen.getByRole("button", { name: "Publish" })
    expect(button.className).toContain("bg-primary")
    expect(button.className).not.toContain("bg-destructive")
  })
})
