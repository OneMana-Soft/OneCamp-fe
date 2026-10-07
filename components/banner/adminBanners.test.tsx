import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "fs"

vi.mock("@/components/banner/EmailOffBanner", () => ({ EmailOffBanner: ({ isAdmin }: { isAdmin?: boolean }) => <p>email {String(isAdmin)}</p> }))
vi.mock("@/components/banner/DiskBanner", () => ({ DiskBanner: ({ isAdmin }: { isAdmin?: boolean }) => <p>disk {String(isAdmin)}</p> }))

const { AdminBanners } = await import("./AdminBanners")

afterEach(cleanup)

describe("the admin banners", () => {
  it("are the email and the disk warnings, each once", () => {
    render(<AdminBanners isAdmin />)
    expect(screen.getAllByText(/^(email|disk) true$/).map((p) => p.textContent)).toEqual(["email true", "disk true"])
  })

  // The disk warning once went into the phone layout twice and the computer
  // layout not at all. Both layouts show the admin banners through this one
  // component, once each.
  it("reach both layouts, once each", () => {
    const layout = readFileSync("app/app/LayoutContent.tsx", "utf8")
    expect(layout.match(/<AdminBanners isAdmin=\{isAdmin\} \/>/g)).toHaveLength(2)
    const phone = layout.slice(layout.indexOf("if (isMobile)"), layout.indexOf("<DesktopNavigationBar>"))
    expect(phone.match(/<AdminBanners /g)).toHaveLength(1)
    expect(layout).not.toMatch(/<(EmailOffBanner|DiskBanner) /)
  })
})
