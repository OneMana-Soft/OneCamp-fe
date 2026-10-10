import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"

// Where a member's data is stored: while the counts run, the dialog holds the
// table's shape (it was a spinner), and a failure says what didn't happen and
// what to do (it said "Could not build the inventory", with "failed" as the
// fallback reason).

const inventory = vi.hoisted(() => vi.fn())
vi.mock("@/services/dataSubjectService", () => ({ getPersonalDataInventory: inventory }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))

const { DataInventoryButton } = await import("./DataInventoryButton")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const open = async () => {
  render(
    <TooltipProvider>
      <DataInventoryButton userUUID="u1" displayName="Priya Raman" />
    </TooltipProvider>,
  )
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Show where data for Priya Raman is stored" })))
}

describe("where a member's data is stored", () => {
  it("holds the table's shape while the rows are counted, not a spinner", async () => {
    inventory.mockReturnValue(new Promise(() => {}))
    await open()
    const loading = screen.getByRole("status", { name: "Counting rows across every table" })
    expect(loading.querySelector(".animate-spin")).toBeNull()
    expect(loading.querySelectorAll(".divide-y > div").length).toBeGreaterThan(2)
  })

  it("says what didn't happen, and what to do, when the counts can't be read", async () => {
    inventory.mockRejectedValue(new Error("Network Error"))
    await open()
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't count Priya Raman's data", variant: "destructive" }),
    )
    expect(toast.mock.calls[0][0].description).not.toBe("failed")
  })
})
