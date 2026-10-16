import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// What the server says about the pause, as useFetch hands it over. A new
// object on each read, as SWR's revalidations give.
let server: { notifications_paused_until?: string | null; focus_until?: string | null } = {}
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: { ...server } }, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))

import { usePauseNotifications } from "./usePauseNotifications"

afterEach(() => {
  server = {}
})

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

// Every consumer may list these moments in an effect's dependencies. A new
// Date on each render is a new value there each time: the sidebar's foot
// reset its clock on every one, which drew it again, and opening the profile
// menu in focus time looped until the app crashed (React error 185).
describe("the pause's moments", () => {
  it("keep one Date while the server's value holds", () => {
    server = { notifications_paused_until: inMinutes(60), focus_until: inMinutes(38) }
    const { result, rerender } = renderHook(() => usePauseNotifications())
    const first = result.current
    rerender()
    rerender()
    expect(result.current.pausedUntil).not.toBeNull()
    expect(result.current.focusUntil).not.toBeNull()
    expect(result.current.pausedUntil).toBe(first.pausedUntil)
    expect(result.current.focusUntil).toBe(first.focusUntil)
  })

  it("take the new moment when the server's changes, and none once it has passed", () => {
    server = { focus_until: inMinutes(38) }
    const { result, rerender } = renderHook(() => usePauseNotifications())
    const first = result.current.focusUntil
    server = { focus_until: inMinutes(90) }
    rerender()
    expect(result.current.focusUntil).not.toBe(first)
    expect(result.current.focusUntil!.getTime()).toBeGreaterThan(first!.getTime())
    server = { focus_until: inMinutes(-5) }
    rerender()
    expect(result.current.focusUntil).toBeNull()
  })
})
