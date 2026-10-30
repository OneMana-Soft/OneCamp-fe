import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useState } from "react"

// 21 Oct 2026 (FLUIDITY-LEAD-5): the palette's first open drew 2,251
// components where it had drawn 155. The palette mounts on its first use now,
// and it reads the profile with useFetch, which asks the server again when it
// mounts. That one request drew every reader of the profile twice over (94
// files read it with useFetchOnlyOnce), because that hook read SWR's
// isValidating for each of them, and SWR draws a reader again for every
// field it read. Nothing had changed; they drew for the request going out
// and coming back.

const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))

const { useFetch, useFetchOnlyOnce } = await import("./useFetch")

const PROFILE = "/user/profile"
const draws = { readers: 0 }
const watched: boolean[] = []

function Reader() {
  const { data } = useFetchOnlyOnce<{ data: { name: string } }>(PROFILE)
  draws.readers++
  return <span>{data?.data.name ?? ""}</span>
}

/** One reader that does ask whether a request is out: it still hears it. */
function Watcher() {
  const profile = useFetchOnlyOnce<{ data: { name: string } }>(PROFILE)
  watched.push(profile.isValidating)
  return null
}

/** A reader mounted late that asks the server again (the palette's useFetch). */
function LateReader() {
  useFetch(PROFILE)
  return null
}

/** Where the late reader mounts: a sibling, so mounting it draws nothing else. */
let mountLate: () => void = () => {}
function Late() {
  const [late, setLate] = useState(false)
  mountLate = () => setLate(true)
  return late ? <LateReader /> : null
}

function Page({ watcher = false }: { watcher?: boolean }) {
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <Reader key={i} />
      ))}
      {watcher ? <Watcher /> : null}
      <Late />
    </>
  )
}

function page(watcher = false) {
  const cache = new Map()
  return render(
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
      <Page watcher={watcher} />
    </SWRConfig>,
  )
}

beforeEach(() => {
  get.mockReset()
  get.mockImplementation(async () => ({ data: { data: { name: "Sam" } } }))
  draws.readers = 0
  watched.length = 0
})
afterEach(() => cleanup())

describe("a late reader asking the server again", () => {
  it("draws none of the profile's other readers when nothing changed", async () => {
    const { container } = page()
    await waitFor(() => expect(container.textContent).toBe("Sam".repeat(10)))
    const before = draws.readers
    act(() => mountLate())
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await act(async () => {})
    expect(draws.readers - before).toBe(0)
  })

  it("still tells a reader that asks whether a request is out", async () => {
    page(true)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    await act(async () => {})
    watched.length = 0
    act(() => mountLate())
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await act(async () => {})
    expect(watched).toContain(true)
    expect(watched.at(-1)).toBe(false)
  })
})
