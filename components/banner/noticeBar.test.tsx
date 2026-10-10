import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { NoticeBar } from "./NoticeBar"

// Every app-wide notice is one row: the email and disk banners each drew
// their own, with a dismiss of about 18px and no focus ring.
afterEach(cleanup)

describe("a notice", () => {
  it("dismisses from a 32px button, 44px under a finger, with a focus ring", () => {
    const onDismiss = vi.fn()
    render(<NoticeBar tone="warning" onDismiss={onDismiss}>Disk filling</NoticeBar>)
    const x = screen.getByRole("button", { name: "Dismiss" })
    const cls = x.className.split(/\s+/)
    expect(cls).toEqual(expect.arrayContaining(["size-8", "[@media(pointer:coarse)]:size-11", "focus-visible:ring-2"]))
    fireEvent.click(x)
    expect(onDismiss).toHaveBeenCalled()
  })

  it("is the row the email, disk and offline notices draw", () => {
    const root = join(__dirname, "..", "..")
    for (const f of ["components/banner/EmailOffBanner.tsx", "components/banner/DiskBanner.tsx", "components/error/OfflineNotice.tsx"]) {
      expect(readFileSync(join(root, f), "utf8"), f).toMatch(/<NoticeBar\b/)
    }
  })
})
