import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider, useStore } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import store from "@/store/store"
import { StoreProvider } from "@/components/providers/StoreProvider"

// The root layout has no store (29 Oct 2026): a part that reads it outside
// /app (a guest's call, a shared doc, a guest's timeline) brings it, and under
// /app's provider it must not start a second one.

afterEach(cleanup)

function StoreOf({ seen }: { seen: (s: unknown) => void }) {
  seen(useStore())
  return null
}

describe("StoreProvider", () => {
  it("gives a part outside the app the app's store", () => {
    let got: unknown
    render(
      <StoreProvider>
        <StoreOf seen={(s) => (got = s)} />
      </StoreProvider>,
    )
    expect(got).toBe(store)
  })

  it("adds none under a provider already: the part reads that one", () => {
    const outer = configureStore({ reducer: () => ({}) })
    let got: unknown
    render(
      <Provider store={outer}>
        <StoreProvider>
          <StoreOf seen={(s) => (got = s)} />
        </StoreProvider>
      </Provider>,
    )
    expect(got).toBe(outer)
  })
})
