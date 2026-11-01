import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Suspense } from "react"
import { ByDynamic, ByEffect, cameAt, KeepsLoading, Outer, Slow, Timed } from "@/testdata/lazyCode/pieces"

// V-138: a test waits for what code draws, never for the code that draws it. Code comes cold the first time (its
// module graph's first transform), which a busy machine takes seconds to bring (searchPageFrame's Who knows strip,
// embedTablePrivacy's Create a new table, boardWorkbench's template picker, under gates at load 68-92). The code here
// is app code (testdata/lazyCode), loaded the ways the app loads code, and it takes longer than a wait's usual second
// on purpose: the delay stands in for that machine.

const unableToFind = /Unable to find an element with the text: never drawn/

afterEach(cleanup)

describe("a wait for what code draws", () => {
  it("lets a piece's code come first, then gives the drawing its usual second", async () => {
    render(<Suspense fallback={null}><Slow /></Suspense>)
    expect(await screen.findByText("arrived")).toBeTruthy()
  })

  it("follows a piece that another piece draws", async () => {
    render(<Suspense fallback={null}><Outer /></Suspense>)
    expect(await screen.findByText("inner")).toBeTruthy()
  })

  it("waits for code that next/dynamic brings through a plain import()", async () => {
    render(<ByDynamic />)
    expect(await screen.findByText("drawn by next/dynamic")).toBeTruthy()
  })

  it("waits for code that an effect brings through a plain import()", async () => {
    render(<ByEffect />)
    expect(await screen.findByText("drawn by an effect")).toBeTruthy()
  })

  it("still fails for what never comes: once the code is in, within the wait's usual second", async () => {
    render(<Suspense fallback={null}><Timed /></Suspense>)
    await expect(screen.findByText("never drawn")).rejects.toThrow(unableToFind)
    const failed = performance.now()
    // It waited for the code, then gave the drawing one usual second, not more (the margin is a busy machine's).
    expect(cameAt()).toBeGreaterThan(0)
    expect(failed - cameAt()).toBeGreaterThanOrEqual(900)
    expect(failed - cameAt()).toBeLessThan(1000 + 1500)
  })

  it("fails in its usual second when no code is coming", async () => {
    render(<p>here</p>)
    const from = performance.now()
    await expect(screen.findByText("never drawn")).rejects.toThrow(unableToFind)
    expect(performance.now() - from).toBeLessThan(1000 + 1500)
  })

  it("fails in its own words, inside the test's budget, while code keeps coming", async () => {
    render(<KeepsLoading />)
    await expect(screen.findByText("never drawn")).rejects.toThrow(unableToFind)
  })
})
