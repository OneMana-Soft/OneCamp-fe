import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "fs"
import { resolve } from "path"

vi.mock("@/components/banner/EmailOffBanner", () => ({ EmailOffBanner: ({ isAdmin }: { isAdmin?: boolean }) => <p>email {String(isAdmin)}</p> }))
vi.mock("@/components/banner/DiskBanner", () => ({ DiskBanner: ({ isAdmin }: { isAdmin?: boolean }) => <p>disk {String(isAdmin)}</p> }))
vi.mock("@/components/banner/ImportOutcomeBanner", () => ({ ImportOutcomeBanner: ({ isAdmin }: { isAdmin?: boolean }) => <p>import {String(isAdmin)}</p> }))
vi.mock("@/components/banner/MembersEditNotice", () => ({ MembersEditNotice: () => <p>members edit</p> }))

const { AdminBanners } = await import("./AdminBanners")

afterEach(cleanup)

describe("the admin banners", () => {
  it("are the email and the disk warnings and the imports' news, each once", () => {
    render(<AdminBanners isAdmin />)
    expect(screen.getAllByText(/^(email|disk|import) true$/).map((p) => p.textContent)).toEqual(["email true", "disk true", "import true"])
  })

  // The admins of a project needn't run the workspace: the server says whom
  // the members-edit notice is for, so it is there for everyone to ask.
  it("ask about the members-edit notice for everyone", () => {
    render(<AdminBanners isAdmin={false} />)
    expect(screen.getAllByText("members edit")).toHaveLength(1)
  })

  // The disk warning once went into the phone layout twice and the computer
  // layout not at all. Both layouts show the admin banners through this one
  // component, once each.
  it("reach both layouts, once each", () => {
    const layout = readFileSync(resolve(__dirname, "../../app/app/LayoutContent.tsx"), "utf8")
    expect(layout.match(/<AdminBanners isAdmin=\{isAdmin\} \/>/g)).toHaveLength(2)
    const phone = layout.slice(layout.indexOf("if (isMobile)"), layout.indexOf("<DesktopNavigationBar>"))
    expect(phone.match(/<AdminBanners /g)).toHaveLength(1)
    expect(layout).not.toMatch(/<(EmailOffBanner|DiskBanner|ImportOutcomeBanner|MembersEditNotice)[ />]/)
  })
})
