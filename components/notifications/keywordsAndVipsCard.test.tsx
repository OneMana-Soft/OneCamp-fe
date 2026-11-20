import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axios from "axios"
import { browserFetch } from "@/lib/http/browserFetch"

// Your keywords and VIPs (chat P3 stage 3): each change saves at once with
// the row's tick, and the toast offers it back (design-14); a refusal puts the
// list back and says the server's words on the row, with no toast.
// V-703: the save is a keepalive request sent the moment Enter adds a word, so
// a reload straight after can't cut it off; the word's chip says Saving until
// the answer, and a word that didn't save stays as Not saved. Only a save that
// got no answer offers Try again; a word the server refused (a 4xx) is refused
// again, so it offers only letting it go, with the reason, and no later change
// sends it (CR-345). V-1086: the save goes through axios's real fetch adapter
// with no User-Agent, which Firefox would send and the API's CORS refuses.

const { state, put, toast } = vi.hoisted(() => ({
  state: { fetch: {} as Record<string, Record<string, unknown>> },
  put: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => state.fetch[url] ?? {},
  useFetchOnlyOnce: (url: string) => state.fetch[url] ?? {},
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put } }))
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

// A mutate writes the list the next render reads, as SWR's cache does.
const kwMutate = vi.fn(async (d: unknown) => void (state.fetch["/me/keywords"].data = d))
const vipMutate = vi.fn(async (d: unknown) => void (state.fetch["/me/vips"].data = d))
/** A save the page can't cut off: a keepalive fetch, with the row's own errors. */
const KEEPALIVE = { suppressErrorToast: true, adapter: browserFetch, fetchOptions: { keepalive: true } }
/** The list a PUT sent. */
const sent = (n = -1) => (put.mock.calls.at(n) as [string, unknown])[1]
/** The server's words for a keyword it refuses (business/PersonalAlert). */
const REFUSED = "A keyword is 2 to 64 characters."
const chipOf = (word: string) => screen.getByRole("button", { name: `Remove keyword ${word}` }).closest("li") as HTMLElement

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
    expect(put).toHaveBeenCalledWith("/me/keywords", { keywords: ["budget", "launch"] }, KEEPALIVE)
    expect(kwMutate).toHaveBeenLastCalledWith({ data: ["budget", "launch"] }, { revalidate: false })
    expect(document.querySelector("[data-saved-tick]")).not.toBeNull()
  })

  it("sends a word the moment Enter adds it, as a request a reload can't cut off, and its chip says Saving until the answer", async () => {
    let answer!: (r: unknown) => void
    put.mockReturnValue(new Promise((r) => (answer = r)))
    render(<KeywordsAndVipsCard />)
    const field = screen.getByLabelText("Keywords")
    fireEvent.change(field, { target: { value: "launch" } })
    fireEvent.keyDown(field, { key: "Enter" })
    // No timer has run: the PUT is out before Enter's handler returns.
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith("/me/keywords", { keywords: ["budget", "launch"] }, KEEPALIVE)
    expect(sent()).toEqual({ keywords: ["budget", "launch"] })
    expect(chipOf("launch")).toHaveTextContent("Saving")
    expect(chipOf("budget")).not.toHaveTextContent("Saving")

    await act(async () => answer({ data: { data: ["budget", "launch"] } }))
    expect(chipOf("launch")).not.toHaveTextContent("Saving")
    expect(chipOf("launch")).not.toHaveTextContent("Not saved")
  })

  it("offers a new word back, and Undo sends the list as it was", async () => {
    put.mockResolvedValue({ data: { data: ["budget", "launch"] } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Keyword added: launch" })))

    put.mockResolvedValue({ data: { data: ["budget"] } })
    const [{ action }] = toast.mock.calls[0] as [{ action: { props: { onClick: () => Promise<void> } } }]
    await act(() => action.props.onClick())
    expect(sent()).toEqual({ keywords: ["budget"] })
    expect(kwMutate).toHaveBeenLastCalledWith({ data: ["budget"] }, { revalidate: false })
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Undone" }))
  })

  it("keeps a word that got no answer as Not saved with the reason, and Try again sends it again", async () => {
    put.mockRejectedValue({ response: { status: 503, data: { msg: "Try again in a moment." } } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    expect(screen.getByText("Try again in a moment.")).toBeInTheDocument()
    // The kept list is the server's again; the word waits beside it, unsaved.
    expect(kwMutate).toHaveBeenLastCalledWith({ data: ["budget"] }, { revalidate: false })
    expect(chipOf("launch")).toHaveTextContent("Not saved")
    expect(toast).not.toHaveBeenCalled()

    put.mockResolvedValue({ data: { data: ["budget", "launch"] } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(put).toHaveBeenCalledTimes(2)
    expect(sent()).toEqual({ keywords: ["budget", "launch"] })
    expect(chipOf("launch")).not.toHaveTextContent("Not saved")
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("offers no Try again for a word the server refused, only letting it go, and keeps its reason beside it", async () => {
    put.mockRejectedValueOnce({ response: { status: 400, data: { msg: REFUSED } } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    expect(chipOf("launch")).toHaveTextContent("Not saved")
    expect(screen.getByText(REFUSED)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()

    // A later change that holds ticks the row; the refused word's reason stays beside it.
    put.mockResolvedValueOnce({ data: { data: ["budget", "sprint"] } })
    await addKeyword("sprint")
    expect(screen.getByText(REFUSED)).toBeInTheDocument()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Remove keyword launch" })))
    expect(put).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(REFUSED)).toBeNull()
  })

  it("leaves a refused word out of every later change, which still saves, and keeps it shown as Not saved", async () => {
    put.mockRejectedValueOnce({ response: { status: 400, data: { msg: REFUSED } } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")

    put.mockResolvedValueOnce({ data: { data: ["budget", "sprint"] } })
    await addKeyword("sprint")
    expect(sent()).toEqual({ keywords: ["budget", "sprint"] })
    expect(chipOf("sprint")).not.toHaveTextContent("Not saved")
    expect(chipOf("launch")).toHaveTextContent("Not saved")

    put.mockResolvedValueOnce({ data: { data: ["sprint"] } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Remove keyword budget" })))
    expect(sent()).toEqual({ keywords: ["sprint"] })
    expect(chipOf("launch")).toHaveTextContent("Not saved")
  })

  it("sends again on Try again only the words that got no answer, never a refused one", async () => {
    put.mockRejectedValueOnce({ response: { status: 400, data: { msg: REFUSED } } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    put.mockRejectedValueOnce({ message: "Network Error" })
    await addKeyword("sprint")
    expect(sent()).toEqual({ keywords: ["budget", "sprint"] })
    expect(chipOf("sprint")).toHaveTextContent("Not saved")

    put.mockResolvedValueOnce({ data: { data: ["budget", "sprint"] } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(sent()).toEqual({ keywords: ["budget", "sprint"] })
    expect(chipOf("sprint")).not.toHaveTextContent("Not saved")
    expect(chipOf("launch")).toHaveTextContent("Not saved")
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("saves through axios's real fetch adapter with no User-Agent, as a keepalive (V-1086)", async () => {
    const fetchStub = vi.fn<(req: Request, opts?: RequestInit) => Promise<Response>>(async () => Response.json({ data: ["budget", "launch"] }))
    vi.stubGlobal("fetch", fetchStub)
    const client = axios.create({ baseURL: "http://api.test/" })
    put.mockImplementation((url: string, body: unknown, config: object) => client.put(url, body, config))
    try {
      render(<KeywordsAndVipsCard />)
      await addKeyword("launch")
      await waitFor(() => expect(chipOf("launch")).not.toHaveAttribute("aria-busy"))
      expect(fetchStub).toHaveBeenCalledTimes(1)
      const [req, opts] = fetchStub.mock.calls[0]
      expect([req.method, req.url]).toEqual(["PUT", "http://api.test/me/keywords"])
      expect(req.headers.get("user-agent")).toBeNull()
      expect(opts?.keepalive).toBe(true)
      expect(chipOf("launch")).not.toHaveTextContent("Not saved")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lets go of a word that never saved without sending anything", async () => {
    put.mockRejectedValue({ response: { status: 503, data: { msg: "Try again in a moment." } } })
    render(<KeywordsAndVipsCard />)
    await addKeyword("launch")
    expect(chipOf("launch")).toHaveTextContent("Not saved")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Remove keyword launch" })))
    expect(put).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: "Remove keyword launch" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })
})

describe("VIPs", () => {
  it("saves the chosen people by id, never offering yourself", async () => {
    put.mockResolvedValue({ data: { data: [{ uuid: "u-maya", name: "Maya" }, { uuid: "u-zed", name: "Zed" }] } })
    render(<KeywordsAndVipsCard />)
    expect(screen.getByTestId("picker").dataset.exclude).toBe("u-me")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Add Zed" })))
    expect(put).toHaveBeenCalledWith("/me/vips", { vips: ["u-maya", "u-zed"] }, KEEPALIVE)
    expect(sent()).toEqual({ vips: ["u-maya", "u-zed"] })
  })
})
