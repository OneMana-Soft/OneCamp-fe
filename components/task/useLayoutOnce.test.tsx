import { act, render } from "@testing-library/react"
import { Suspense, useLayoutEffect } from "react"
import { describe, expect, it } from "vitest"

import { useLayoutOnce } from "./useLayoutOnce"

describe("useLayoutOnce", () => {
  it("runs once per key, even when a Suspense boundary hides the component and shows it again", async () => {
    let once = 0
    let plain = 0
    let release: () => void = () => {}
    const pending = new Promise<void>((r) => (release = r))
    let loaded = false

    function Probe({ id }: { id: string }) {
      useLayoutOnce(id, () => {
        once++
      })
      useLayoutEffect(() => {
        plain++
      }, [id])
      return <p>probe</p>
    }
    // A chunk still loading, as next/dynamic's lazy component is.
    function Chunk({ wanted }: { wanted: boolean }) {
      if (wanted && !loaded) throw pending
      return null
    }
    const App = ({ wanted, id }: { wanted: boolean; id: string }) => (
      <Suspense fallback={<p>loading</p>}>
        <Probe id={id} />
        <Chunk wanted={wanted} />
      </Suspense>
    )

    const { rerender } = render(<App wanted={false} id="a" />)
    expect(once).toBe(1)

    rerender(<App wanted id="a" />)
    await act(async () => {
      loaded = true
      release()
      await pending
    })
    // React ran the plain layout effect again as it showed the page anew;
    // the once-per-key one did not.
    expect(plain).toBeGreaterThan(1)
    expect(once).toBe(1)

    rerender(<App wanted id="b" />)
    expect(once).toBe(2)
  })
})
