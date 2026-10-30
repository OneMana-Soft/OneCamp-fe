/**
 * Next's app router as tests draw it: the contexts its own hooks read
 * (useRouter, usePathname, useSearchParams), held at an address that moves as
 * Next moves it. Nothing of next/navigation is mocked, so a component under
 * test renders again exactly when it would in the app.
 *
 * On every address write, a push, a replace or a history.replaceState alike,
 * Next gives LayoutRouterContext a new value (16.3), and useRouter() reads it:
 * a query-only write draws every caller again. The path's context changes only
 * when the path does, and the query's only when the query does.
 *
 *   const at = renderAtAddress(<Thing />, "/app/calendar?date=2026-10-21")
 *   act(() => at.go("/app/calendar?date=2026-10-22"))
 *   expect(at.router.push).toHaveBeenCalledWith(...)
 */

import { useMemo, useState, type ReactNode } from "react"
import { render } from "@testing-library/react"
import { vi } from "vitest"
import { AppRouterContext, LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime"

/** Next's router, with every move a mock. */
export function routerForTests() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    hmrRefresh: vi.fn(),
    bfcacheId: "_b_0_",
  }
}

type RouterForTests = ReturnType<typeof routerForTests>

let moveTo: ((url: string) => void) | null = null

function At({ start, router, children }: { start: string; router: RouterForTests; children: ReactNode }) {
  const [url, setUrl] = useState(start)
  moveTo = setUrl
  const { pathname, search } = new URL(url, "http://localhost")
  // A new value on every write, as Next's own is (its tree and cache node).
  const layout = useMemo(() => ({ parentCacheNode: { bfcacheId: 0 }, url }), [url]) as unknown as React.ContextType<typeof LayoutRouterContext>
  const query = useMemo(() => new URLSearchParams(search), [search])
  return (
    <AppRouterContext.Provider value={router}>
      <LayoutRouterContext.Provider value={layout}>
        <PathnameContext.Provider value={pathname}>
          <SearchParamsContext.Provider value={query}>{children}</SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </LayoutRouterContext.Provider>
    </AppRouterContext.Provider>
  )
}

/**
 * Draws `ui` at `url`. `go` moves the address (wrap it in act), and `router`
 * holds the moves the app asked Next for.
 */
export function renderAtAddress(ui: ReactNode, url: string) {
  const router = routerForTests()
  const view = render(<At start={url} router={router}>{ui}</At>)
  return { ...view, router, go: moveAddress }
}

/**
 * The same address as a wrapper, for a test that draws through a wrapper of
 * its own (SWR's): `<AtAddress url="/app/admin?tab=apps">…</AtAddress>`.
 */
export function AtAddress({ url, children }: { url: string; children: ReactNode }) {
  const [router] = useState(routerForTests)
  return <At start={url} router={router}>{children}</At>
}

/** Moves the address of what's drawn at one (wrap it in act). */
export function moveAddress(next: string) {
  if (!moveTo) throw new Error("nextAddress: nothing is drawn")
  moveTo(next)
}
