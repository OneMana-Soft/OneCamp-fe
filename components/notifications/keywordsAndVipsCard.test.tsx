import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Your keywords and VIPs (chat P3 stage 3): each change saves at once with
// the row's tick; a refusal puts the list back and says the server's words on
// the row, never a toast.

const { state, put, toast } = vi.hoisted(() => ({
  state: { fetch: {} as Record<string, Record<string, unknown>> },
  put: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => state.fetch[url] ?? {},
  useFetchOnlyOnce: (url: string) => state.fetch[url] ?? {},
}))
vi.mock("@/lib/axiosInstance", () => ({ default: { put }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/components/common/peoplePicker", () => ({
  PeoplePicker: ({ value, onChange, exclude }: { value: { uuid: string; name: string }[]; onChange: (v: unknown) => void; exclude?: string[] }) => (
    <div data-testid="picker" data-exclude={(exclude ?? []).join(",")}>
      {value.map((p) => (
        <button key={p.uuid} type="button" onClick={() => onChange(value.filter((x) => x.uuid !== p.uuid))}>
          Remove {p.name}
        </button>
      ))}
      <button type="button" onClick={() => onChange([...value, { uuid: "u-zed", name: "Zed" }])}>Add Zed</button>
    </div>
  ),
}))

import { KeywordsAndVipsCard } from "./KeywordsAndVipsCard"

const kwMutate = vi.fn(async () => undefined)
const vipMutate = vi.fn(async () => undefined)

beforeEach(() => {
  state.fetch = {
    "/me/keywords": { data: { data: ["budget"] }, mutate: kwMutate },
    "/me/vips": { data: { data: [{ uuid: "u-maya", name: "Maya" }] }, mutate: vipMutate },
    "/user/profile": { data: { data: { user_uuid: "u-me" } } },
  }
  put.mockReset()
  toast.mockReset()
  kwMutate.mockClear()
  vipMutate.mockClear()
})
afterEach(cleanup)

const addKeyword = async (word: string) => {
  fireEvent.change(screen.getByLabelText("Keywords"), { target: { value: word } })
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Add keyword" })))
}

describe("keywords", () => {
  it("saves the list with the new word and ticks the row", async () => {
    put.mockResolvedValue({ data: { data: ["budget", "launch"] } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    expect(put).toHaveBeenCalledWith("/me/keywords", { keywords: ["budget", "launch"] }, { suppressErrorToast: true })
    expect(kwMutate).toHaveBeenLastCalledWith({ data: ["budget", "launch"] }, { revalidate: false })
    expect(document.querySelector("[data-saved-tick]")).not.toBeNull()
  })

  it("puts the list back and says the server's reason when it's refused", async () => {
    put.mockRejectedValue({ response: { status: 400, data: { msg: "A keyword is 2 to 64 characters." } } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    expect(screen.getByText("A keyword is 2 to 64 characters.")).toBeInTheDocument()
    expect(kwMutate).toHaveBeenLastCalledWith({ data: ["budget"] }, { revalidate: false })
    expect(toast).not.toHaveBeenCalled()
  })
})

describe("VIPs", () => {
  it("saves the chosen people by id, never offering yourself", async () => {
    put.mockResolvedValue({ data: { data: [{ uuid: "u-maya", name: "Maya" }, { uuid: "u-zed", name: "Zed" }] } })
    render(<KeywordsAndVipsCard />)
    expect(screen.getByTestId("picker").dataset.exclude).toBe("u-me")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Add Zed" })))
    expect(put).toHaveBeenCalledWith("/me/vips", { vips: ["u-maya", "u-zed"] }, { suppressErrorToast: true })
  })
})
