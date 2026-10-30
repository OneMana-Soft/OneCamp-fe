// First: React DOM looks for the DevTools hook as it loads.
import { renders } from "@/lib/testing/reactRenders"

import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"

type Hook = { onCommitFiberRoot(id: number, root: unknown): void }
const hook = (globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: Hook }).__REACT_DEVTOOLS_GLOBAL_HOOK__

describe("the render count", () => {
  it("counts the components a commit rendered", () => {
    function Greeting() {
      return <p>Hello</p>
    }
    renders.reset()
    render(<Greeting />)
    expect(renders.count).toBe(1)
    expect(renders.top()).toBe("Greeting 1")
  })

  // React drops an error the hook throws, so a commit the walk couldn't count
  // would leave a short count that a budget passes on.
  it("throws when a commit couldn't be counted, until it starts again", () => {
    renders.reset()
    const unknownShape = {
      get tag(): number {
        throw new Error("a fiber the walk doesn't know")
      },
    }
    hook.onCommitFiberRoot(1, { current: unknownShape })
    expect(() => renders.count).toThrow(/couldn't count a commit/)
    renders.reset()
    expect(renders.count).toBe(0)
  })
})
