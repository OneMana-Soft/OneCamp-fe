import { afterEach, describe, expect, it, vi } from "vitest"
import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { debounceUtil } from "./debounce"

afterEach(() => void vi.useRealTimers())

describe("debounceUtil", () => {
  it("calls once, after the last call has rested", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounceUtil(fn, 50)
    d()
    d()
    vi.advanceTimersByTime(49)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("can be cancelled, so a component that has gone sets nothing", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounceUtil(fn, 50)
    d()
    d.cancel()
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// A component that keeps a debounce (useMemo(() => debounceUtil(…))) cancels it
// when it unmounts: one left running sets state on a component that has gone.
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : sources(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })

describe("every component's debounce", () => {
  it("is cancelled when the component unmounts", () => {
    const keeping = ["components", "hooks", "app"].flatMap(sources).filter((f) => /useMemo\(\s*\(\)\s*=>\s*(?:\n\s*)?debounceUtil/.test(readFileSync(f, "utf8")))
    expect(keeping.length).toBeGreaterThan(3)
    expect(keeping.filter((f) => !/\.cancel\b/.test(readFileSync(f, "utf8")))).toEqual([])
  })
})
