import { Component, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The phone's top bar is drawn outside the page's error boundary. A part of it
// whose code couldn't come (offline, a dropped connection) was thrown by
// next/dynamic or React.lazy to the app's boundary, which took the whole app
// with it until a reload (AUDIT-WEB W4). The bar now draws without the part,
// and fetches it again once the browser is back online.

let pathname = "/app/doc/d1"
let failing = true
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1", user_is_admin: false } } }),
  useFetch: () => ({}),
}))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/components/navigationBar/mobile/mobileTopNavigationBarThirdDoc", () => {
  if (failing) throw new Error("Loading chunk 41 failed")
  return { MobileTopNavigationBarThirdDoc: ({ docId }: { docId: string }) => <button type="button">Options for doc {docId}</button> }
})
vi.mock("@/components/workGraph/ConnectedTrigger", () => {
  if (failing) throw new Error("Loading chunk 42 failed")
  return { ConnectedTrigger: ({ kind }: { kind: string }) => <button type="button">Connected to this {kind}</button> }
})

import { MobileTopNavigationBarThird } from "./mobileTopNavigationBarThird"

/** Stands in for GlobalErrorBoundary, the one boundary above the bar. */
class AppBoundary extends Component<{ children: ReactNode }, { broke: boolean }> {
  state = { broke: false }
  static getDerivedStateFromError() {
    return { broke: true }
  }
  render() {
    return this.state.broke ? <p>OneCamp hit a problem it couldn&apos;t recover from</p> : this.props.children
  }
}

function App() {
  return (
    <AppBoundary>
      <header>
        <MobileTopNavigationBarThird />
      </header>
      <main>
        <h1>The page</h1>
      </main>
    </AppBoundary>
  )
}

async function backOnline() {
  failing = false
  await act(async () => {
    window.dispatchEvent(new Event("online"))
  })
}

afterEach(() => {
  cleanup()
  failing = true
  vi.restoreAllMocks()
})

describe("the phone's top bar, when a part's code can't come", () => {
  it("draws a doc's bar without its actions, keeps the app, and brings them once back online", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    pathname = "/app/doc/d1"
    render(<App />)
    await act(async () => {})
    expect(screen.queryByText(/couldn't recover/)).toBeNull()
    expect(screen.getByRole("heading", { name: "The page" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Options for doc d1" })).toBeNull()

    await backOnline()
    expect(await screen.findByRole("button", { name: "Options for doc d1" })).toBeTruthy()
  })

  it("draws a task's bar with its options but no Connected, keeps the app, and brings Connected once back online", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    pathname = "/app/task/t1"
    render(<App />)
    await act(async () => {})
    expect(screen.queryByText(/couldn't recover/)).toBeNull()
    expect(screen.getByRole("button", { name: "Task options" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Connected to this task" })).toBeNull()

    await backOnline()
    expect(await screen.findByRole("button", { name: "Connected to this task" })).toBeTruthy()
  })
})
