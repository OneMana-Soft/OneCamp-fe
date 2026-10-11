import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { captureTiles, flipTiles, invert } from "@/components/livekit/stageMotion"

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height }) as DOMRect

afterEach(() => vi.unstubAllGlobals())

describe("the stage's reflow", () => {
  it("inverts by translate and scale only", () => {
    expect(invert(box(0, 0, 400, 300), box(0, 0, 400, 300))).toBeNull()
    expect(invert(box(10, 20, 400, 300), box(0, 0, 200, 150))).toBe("translate(10px, 20px) scale(2, 2)")
  })

  it("animates transform and opacity, never width or height", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
    window.matchMedia = globalThis.matchMedia
    const stage = document.createElement("div")
    const a = document.createElement("div")
    a.dataset.flipKey = "maya|camera"
    const b = document.createElement("div")
    b.dataset.flipKey = "jonas|camera"
    stage.append(a, b)
    const calls: Keyframe[][] = []
    for (const el of [a, b]) (el as unknown as { animate: (k: Keyframe[]) => void }).animate = (k: Keyframe[]) => void calls.push(k)
    a.getBoundingClientRect = () => box(0, 0, 200, 150)
    const before = new Map([["maya|camera", box(0, 0, 400, 300)], ["priya|camera", box(400, 0, 400, 300)]])
    expect(flipTiles(stage, before)).toBe(2)
    for (const frames of calls) for (const f of frames) for (const k of Object.keys(f)) expect(["transform", "opacity", "transformOrigin"]).toContain(k)
    expect(captureTiles(stage).size).toBe(2)
  })

  it("is what the stage uses, with no layout transition on tiles", () => {
    const src = readFileSync(resolve(__dirname, "VideoConference.tsx"), "utf8")
    expect(src).toMatch(/flipTiles\(/)
    expect(src).not.toMatch(/transition-\[[^\]]*(width|height)/)
    const tile = readFileSync(resolve(__dirname, "StageTile.tsx"), "utf8")
    expect(tile).not.toMatch(/transition-\[[^\]]*(width|height)/)
  })
})
