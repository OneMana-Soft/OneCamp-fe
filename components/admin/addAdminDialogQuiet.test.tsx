import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Making someone an admin goes through usePost like every other admin write,
// quietly: the dialog says a refusal beside the choice, so neither usePost's
// toast nor the global one says it a second time. It used to call axios with
// OWN_ERRORS itself, a path of its own for one request.

const ZERO = "0001-01-01T00:00:00Z"
const hana = { user_uuid: "m3", user_name: "Hana Kobayashi", user_full_name: "Hana Kobayashi", user_email_id: "hana@kestrel.studio", user_deleted_at: ZERO }

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: http.get, post: http.post }, OWN_ERRORS: { suppressErrorToast: true } }))
const makeRequest = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))

const { AddAdminDialog } = await import("./AddAdminDialog")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function choose() {
  http.get.mockImplementation(async (url: string) =>
    url.startsWith("/admin/getAllAdminUsers") ? { data: { data: [], has_more: false } } : { data: { data: [hana], has_more: false } },
  )
  const onSuccess = vi.fn()
  await act(async () => {
    render(<AddAdminDialog open onOpenChange={() => {}} onSuccess={onSuccess} />)
  })
  fireEvent.click(screen.getByRole("button", { name: /Hana Kobayashi/ }))
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make admin" })))
  return onSuccess
}

describe("making someone an admin", () => {
  it("sends through usePost, quietly", async () => {
    makeRequest.mockResolvedValue({})
    const onSuccess = await choose()
    expect(makeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ apiEndpoint: "/admin/createAdmin", payload: { user_uuid: "m3" }, quiet: true }),
    )
    expect(http.post).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({ title: "Hana Kobayashi is an admin now" })
    expect(onSuccess).toHaveBeenCalled()
  })

  it("says a refusal in the dialog, once", async () => {
    makeRequest.mockRejectedValue({ response: { data: { msg: "Only an admin can do that." } } })
    const onSuccess = await choose()
    expect(screen.getByRole("alert").textContent).toMatch(/Only an admin can do that\./)
    expect(toast).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
