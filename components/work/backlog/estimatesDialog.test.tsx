import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const post = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))
const answers = vi.hoisted(() => ({ estimates: undefined as unknown, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: answers.estimates, mutate: answers.mutate }) }))

import EstimatesDialog from "./EstimatesDialog"

const KINDS = [
  { kind: "exponential", name: "Exponential", sizes: [1, 2, 4, 8, 16], more: [32, 64] },
  { kind: "fibonacci", name: "Fibonacci", sizes: [1, 2, 3, 5, 8], more: [13, 21] },
  { kind: "linear", name: "Linear", sizes: [1, 2, 3, 4, 5], more: [6, 7] },
  { kind: "tshirt", name: "T-shirt", sizes: [1, 2, 3, 5, 8], more: [13, 21], names: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
]

afterEach(() => {
  cleanup()
  post.mockReset()
  answers.mutate.mockReset()
})

// linear-05: a project's admin picks how it estimates.
describe("a project's estimates", () => {
  it("holds the scales' place while they're read, with nothing to save yet", () => {
    answers.estimates = undefined
    render(<EstimatesDialog projectId="p" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByRole("status", { name: "Loading the project's estimates" })).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("starts on hours, shows each scale's sizes, and saves the one picked", async () => {
    answers.estimates = { data: { scale: null, kinds: KINDS, can_edit: true } }
    post.mockResolvedValue({ data: { data: { scale: { kind: "tshirt", extended: true, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8, 13, 21], labels: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] } } } })
    const saved = vi.fn()
    const closed = vi.fn()
    render(<EstimatesDialog projectId="p-1" onClose={closed} onSaved={saved} />)
    expect(screen.getByRole("radio", { name: "Hours" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("XS, S, M, L, XL")).toBeTruthy()
    expect(screen.queryByText(/The two larger sizes/)).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "T-shirt" }))
    fireEvent.click(screen.getByRole("switch", { name: /The two larger sizes \(XXL and XXXL\)/ }))
    expect(screen.getByText("XS, S, M, L, XL, XXL, XXXL")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/project/p-1/estimates", { kind: "tshirt", extended: true, allow_zero: false, count_unestimated: true }, OWN_ERRORS))
    await waitFor(() => expect(closed).toHaveBeenCalled())
    expect(saved).toHaveBeenCalled()
  })

  it("says the server's reason when saving fails, and stays open", async () => {
    answers.estimates = { data: { scale: null, kinds: KINDS, can_edit: true } }
    post.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { msg: "Only the project's admins can change how it estimates." } } })
    const closed = vi.fn()
    render(<EstimatesDialog projectId="p-1" onClose={closed} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "Fibonacci" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/admins can change how it estimates|couldn't be saved/)
    expect(closed).not.toHaveBeenCalled()
  })
})
