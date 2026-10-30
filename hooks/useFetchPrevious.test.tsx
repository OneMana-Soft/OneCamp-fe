import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useState } from "react"

// A read that keeps the last answer on screen while the next key's comes
// (keepPreviousData) keeps handing that answer back when the next key's read
// fails. Readers that drew their failure only when they had no data showed the
// last key's answer as the current one's (AUDIT-WEB W5). isPrevious says the
// data is another key's.

const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))

const { useFetch } = await import("./useFetch")

function Reader({ url, keep }: { url: string; keep: boolean }) {
  const { data, isError, isPrevious, mutate } = useFetch<{ hits: string }>(url, undefined, keep ? { keepPreviousData: true } : undefined)
  return (
    <>
      <output>{`${data?.hits ?? "none"} | ${isPrevious ? "previous" : "own"} | ${isError ? "failed" : "ok"}`}</output>
      <button type="button" onClick={() => void mutate()}>
        Try again
      </button>
    </>
  )
}

function Search({ keep }: { keep: boolean }) {
  const [url, setUrl] = useState("/search?q=launch")
  return (
    <>
      <button type="button" onClick={() => setUrl("/search?q=launch+plan")}>
        Type more
      </button>
      <Reader url={url} keep={keep} />
    </>
  )
}

let planFails = true

function page(keep: boolean) {
  get.mockImplementation(async (url: string) => {
    if (url.includes("plan") && planFails) throw new Error("offline")
    return { data: { hits: url.includes("plan") ? "Ines" : "Sam" } }
  })
  const cache = new Map()
  render(
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false }}>
      <Search keep={keep} />
    </SWRConfig>,
  )
}

const press = (name: string) => act(() => screen.getByRole("button", { name }).click())

afterEach(() => {
  cleanup()
  get.mockReset()
  planFails = true
})

describe("useFetch's isPrevious", () => {
  it("says the answer on screen is the last key's while the next key's read fails, and not once that key answers", async () => {
    page(true)
    expect(await screen.findByText("Sam | own | ok")).toBeTruthy()
    press("Type more")
    expect(await screen.findByText("Sam | previous | failed")).toBeTruthy()

    planFails = false
    press("Try again")
    expect(await screen.findByText("Ines | own | ok")).toBeTruthy()
  })

})
