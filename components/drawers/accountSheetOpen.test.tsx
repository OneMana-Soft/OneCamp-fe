import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { flushSync } from "react-dom"

// fluid-16 (FLUIDITY-LEAD, 20 Oct 2026; design/WIN-ALL-ROWS.md "fluidity"): the
// phone's account sheet took 682-803 ms at 4x from the tap on the Home bar's
// avatar until it showed, against a target of 300. The Home bar opens the
// sheet through the shell's UI manager, which drew it with next/dynamic: the
// first open suspended there, React committed the empty fallback, and once the
// code had come it held the sheet back until 300 ms after that fallback (its
// reveal throttle), on a timer of 271 ms in the trace. The code had nothing to
// fetch: the signed-in layout already carries it, because the phone's bottom
// bar holds the same sheet. So the manager draws it at once, and the sheet
// opens in the render after the tap's (a deferred value): the tap paints first,
// and what opening a sheet sets off (the scroll lock, the page stepping back,
// the focus) runs after the sheet's first frame instead of inside the tap.

const SAM = { user_is_admin: false, user_uuid: "u1", user_name: "sam", user_full_name: "Sam Rivera" }

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
  useFeature: () => false,
}))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => false }) }))
vi.mock("@/hooks/useFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useFetch")>()),
  useFetchOnlyOnce: () => ({ data: { data: SAM } }),
}))
vi.mock("@/components/navigationBar/mobile/phoneSelfAvatar", () => ({ PhoneSelfAvatar: () => <span data-avatar="" /> }))
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout: () => {} }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))
vi.mock("@/components/activeTheme/activeTheme", () => ({ useThemeConfig: () => ({ activeTheme: "onecamp", setActiveTheme: () => {} }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: () => {} }) }))
vi.mock("@/components/invite/MemberInviteDialog", () => ({ MemberInviteDialog: () => null }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/hooks/useFocusTime", () => ({ useFocusTime: () => ({ start: async () => true, end: async () => true, busy: false }) }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
// The shell's UI state, a store as react-redux reads one: the Home bar's avatar opens the account sheet in it.
const shell = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const at = (open: boolean) => ({ ui: new Proxy({}, { get: (_, key) => ({ isOpen: open && key === "userProfileDrawer", data: null }) }), users: { usersStatus: {} } })
  const states = { open: at(true), closed: at(false) }
  let state = states.open
  return {
    get: () => state,
    subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    set: (open: boolean) => {
      state = open ? states.open : states.closed
      listeners.forEach((l) => l())
    },
  }
})
vi.mock("react-redux", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    useSelector: (pick: (state: unknown) => unknown) => useSyncExternalStore(shell.subscribe, () => pick(shell.get())),
    useDispatch: () => () => {},
  }
})

import { UnifiedUIManager } from "@/components/ui/UnifiedUIManager"

afterEach(() => {
  cleanup()
  shell.set(true)
})

describe("the phone's account sheet, opened from the Home bar", () => {
  it("opens in the render after the tap's, with no timer to wait out and nothing to fetch", async () => {
    vi.useFakeTimers()
    try {
      render(<UnifiedUIManager />)
      // React's own work, and no timer: a lazy boundary's reveal waited 300 ms on one.
      await act(async () => {})
      expect(screen.getByText("App menu")).toBeTruthy()
      expect(screen.getByRole("button", { name: /^Your profile: sam/ })).toBeTruthy()
      expect(screen.getByText("Tables")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("draws nothing in the tap's own render, so the tap paints at once: the sheet comes in the render after", async () => {
    vi.useFakeTimers()
    try {
      shell.set(false)
      render(<UnifiedUIManager />)
      // The tap's update, synchronous as a store's is: its own render draws no sheet.
      const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      env.IS_REACT_ACT_ENVIRONMENT = false
      flushSync(() => shell.set(true))
      env.IS_REACT_ACT_ENVIRONMENT = true
      expect(screen.queryByText("App menu"), "drawn inside the tap").toBeNull()
      await act(async () => {})
      expect(screen.getByText("App menu")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it("costs no bytes to draw at once: the signed-in layout already carries its code, through the phone's bottom bar", async () => {
    const { reach } = (await import("../../scripts/fluidity/reach.mjs")) as { reach: (entry: string) => Map<string, string | null> }
    expect(reach("app/app/layout.tsx").has("components/drawers/userProfileDrawer.tsx"), "if the layout stops carrying it, warm it with lib/lazy/lazyPart instead").toBe(true)
    const manager = readFileSync("components/ui/UnifiedUIManager.tsx", "utf8")
    expect(manager).not.toMatch(/(dynamic|lazy|lazyPart)\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/drawers\/userProfileDrawer["']/)
  })
})
