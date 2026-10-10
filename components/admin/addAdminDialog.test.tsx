import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Making someone an admin: the picker offers every member, however far down
// the list they are, leaves out people who are admins already and people who
// are deactivated, and can be used from the keyboard. A refusal is said in the
// dialog, which stays open.

const ZERO = "0001-01-01T00:00:00Z"
const member = (i: number, extra: Record<string, unknown> = {}) => ({
  user_uuid: `m${i}`,
  user_name: `Member ${i}`,
  user_full_name: `Member ${i}`,
  user_email_id: `m${i}@kestrel.studio`,
  user_deleted_at: ZERO,
  ...extra,
})

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: http.get, post: http.post }, OWN_ERRORS: { suppressErrorToast: true } }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))

const { AddAdminDialog } = await import("./AddAdminDialog")

function answer(members: unknown[][], admins: unknown[]) {
  http.get.mockImplementation(async (url: string) => {
    if (url.startsWith("/admin/getAllAdminUsers")) return { data: { data: admins, has_more: false } }
    const page = Number(new URL(url, "https://x").searchParams.get("pageIndex") || 0)
    return { data: { data: members[page] ?? [], has_more: page < members.length - 1 } }
  })
}

async function open(onSuccess = vi.fn()) {
  await act(async () => {
    render(<AddAdminDialog open onOpenChange={() => {}} onSuccess={onSuccess} />)
  })
  return onSuccess
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("making someone an admin", () => {
  it("finds a member who is only on a later page of the list", async () => {
    const first = Array.from({ length: 100 }, (_, i) => member(i))
    answer([first, [member(100, { user_name: "Astrid Duarte", user_full_name: "Astrid Duarte" })]], [])
    await open()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search members" }), { target: { value: "astrid" } })
    expect(screen.getByRole("button", { name: /Astrid Duarte/ })).toBeTruthy()
  })

  it("leaves out current admins and deactivated members", async () => {
    answer(
      [[member(1, { user_name: "Priya Raman" }), member(2, { user_name: "Marcus Webb", user_deleted_at: "2026-09-26T17:40:00Z" }), member(3, { user_name: "Hana Kobayashi" })]],
      [member(1, { user_name: "Priya Raman" })],
    )
    await open()
    expect(screen.queryByRole("button", { name: /Priya Raman/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Marcus Webb/ })).toBeNull()
    expect(screen.getByRole("button", { name: /Hana Kobayashi/ })).toBeTruthy()
  })

  it("picks a member with real buttons, and makes them an admin", async () => {
    answer([[member(3, { user_name: "Hana Kobayashi" })]], [])
    http.post.mockResolvedValue({ data: {} })
    const onSuccess = await open()
    const hana = screen.getByRole("button", { name: /Hana Kobayashi/ })
    expect(hana.tagName).toBe("BUTTON")
    expect(hana.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(hana)
    expect(hana.getAttribute("aria-pressed")).toBe("true")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make admin" })))
    // The refusal, if any, is said in the dialog: the global toast stands down.
    expect(http.post).toHaveBeenCalledWith("/admin/createAdmin", { user_uuid: "m3" }, { suppressErrorToast: true })
    expect(toast).toHaveBeenCalledWith({ title: "Hana Kobayashi is an admin now" })
    expect(onSuccess).toHaveBeenCalled()
  })

  it("says in the dialog why the server refused, and stays open", async () => {
    answer([[member(3, { user_name: "Hana Kobayashi" })]], [])
    http.post.mockRejectedValue({ response: { data: { msg: "Only an admin can do that." } } })
    const onSuccess = await open()
    fireEvent.click(screen.getByRole("button", { name: /Hana Kobayashi/ }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make admin" })))
    expect(screen.getByRole("alert").textContent).toMatch(/Only an admin can do that\./)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("says the members couldn't be loaded, with Try again", async () => {
    http.get.mockRejectedValue(new Error("Network Error"))
    await open()
    expect(screen.getByText("Couldn't load the members")).toBeTruthy()
    answer([[member(3, { user_name: "Hana Kobayashi" })]], [])
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(screen.getByRole("button", { name: /Hana Kobayashi/ })).toBeTruthy()
  })
})
