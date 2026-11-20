import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

const fetched = vi.hoisted(() => ({
  urls: [] as string[],
  data: undefined as unknown,
  isError: false,
  mutate: vi.fn(),
  profile: undefined as unknown,
  once: [] as string[],
  directory: undefined as unknown,
  directoryError: false,
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    fetched.urls.push(url)
    return { data: url ? fetched.data : undefined, isError: fetched.isError, mutate: fetched.mutate }
  },
  useFetchOnlyOnce: (url: string) => {
    fetched.once.push(url)
    if (url === "/calendar/rooms") return { data: fetched.directory, isError: fetched.directoryError, mutate: fetched.mutate }
    return { data: url ? fetched.profile : undefined }
  },
}))

import { useFreeRooms, useMayBookRooms, useRoomDirectory } from "@/hooks/useRooms"
import { pinTestClock } from "@/lib/testing/testClock"

// A fixed day, so nothing here reads the machine's clock.
pinTestClock()

const START = new Date("2026-10-21T14:00:00Z")
const END = new Date("2026-10-21T15:00:00Z")

beforeEach(() => {
  fetched.urls = []
  fetched.data = undefined
  fetched.isError = false
  fetched.profile = undefined
  fetched.once = []
  fetched.directory = undefined
  fetched.directoryError = false
  fetched.mutate.mockReset()
})

describe("useFreeRooms", () => {
  it("reads the rooms free for the slot", () => {
    fetched.data = { data: [{ id: "r-atlas", name: "Atlas", building: "", floor: "", capacity: 8, features: [] }] }
    const { result } = renderHook(() => useFreeRooms(START, END, 2))
    expect(fetched.urls.at(-1)).toBe("/calendar/rooms/free?from=2026-10-21T14%3A00%3A00.000Z&to=2026-10-21T15%3A00%3A00.000Z&capacity=2")
    expect(result.current.rooms?.map((r) => r.id)).toEqual(["r-atlas"])
    expect(result.current.failed).toBe(false)
  })

  it("asks nothing for a slot that ends before it starts, and says a failed read", () => {
    renderHook(() => useFreeRooms(END, START, 2))
    expect(fetched.urls.at(-1)).toBe("")
    fetched.isError = true
    const { result } = renderHook(() => useFreeRooms(START, END, 2))
    expect(result.current.failed).toBe(true)
    result.current.retry()
    expect(fetched.mutate).toHaveBeenCalled()
  })

  it("asks nothing past the server's 14 days, and says so instead of a failure", () => {
    const fortnight = new Date(START.getTime() + 14 * 24 * 60 * 60_000)
    const { result: atLimit } = renderHook(() => useFreeRooms(START, fortnight, 2))
    expect(fetched.urls.at(-1)).not.toBe("")
    expect(atLimit.current.tooLong).toBe(false)
    fetched.isError = true
    const { result } = renderHook(() => useFreeRooms(START, new Date(fortnight.getTime() + 60_000), 2))
    expect(fetched.urls.at(-1)).toBe("")
    expect(result.current).toMatchObject({ tooLong: true, failed: false, rooms: undefined })
  })
})

describe("useMayBookRooms", () => {
  it("lets a member book, never a guest or a bot, and nobody before the profile is read", () => {
    expect(renderHook(() => useMayBookRooms()).result.current).toBe(false)
    fetched.profile = { data: { user_uuid: "u1" } }
    expect(renderHook(() => useMayBookRooms()).result.current).toBe(true)
    fetched.profile = { data: { user_uuid: "u1", is_external: true } }
    expect(renderHook(() => useMayBookRooms()).result.current).toBe(false)
    fetched.profile = { data: { user_uuid: "u1", is_bot: true } }
    expect(renderHook(() => useMayBookRooms()).result.current).toBe(false)
  })
})

describe("useRoomDirectory", () => {
  it("asks nothing until asked, then reads the directory once on its own key, retired rooms left out", () => {
    const { result, rerender } = renderHook(({ ask }) => useRoomDirectory(ask), { initialProps: { ask: false } })
    expect(fetched.once).toEqual([""])
    expect(result.current).toMatchObject({ rooms: undefined, failed: false })
    fetched.directory = { data: [{ id: "r-atlas", name: "Atlas", building: "", floor: "", capacity: 8, features: [], retired: false }, { id: "r-old", name: "Old", building: "", floor: "", capacity: 4, features: [], retired: true }] }
    rerender({ ask: true })
    expect(fetched.once.at(-1)).toBe("/calendar/rooms")
    expect(result.current.rooms?.map((r) => r.id)).toEqual(["r-atlas"])
  })

  it("says a directory of retired rooms alone is empty, and a failed read with its retry", () => {
    fetched.directory = { data: [{ id: "r-old", name: "Old", building: "", floor: "", capacity: 4, features: [], retired: true }] }
    expect(renderHook(() => useRoomDirectory(true)).result.current.rooms).toEqual([])
    fetched.directory = undefined
    fetched.directoryError = true
    const { result } = renderHook(() => useRoomDirectory(true))
    expect(result.current).toMatchObject({ rooms: undefined, failed: true })
    result.current.retry()
    expect(fetched.mutate).toHaveBeenCalled()
  })
})
