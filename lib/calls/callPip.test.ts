import { afterEach, describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { CALL_PIP_SIZE, lastSpeaker, pipOrder, pipVideo } from "./callPip"

// The speaking times below are dates: the clock they are read by is pinned (app/testClock.test.ts).
pinTestClock()

// What a call's picture-in-picture shows (meet-14, as Meet's): the one
// picture you'd look for with the call's tab out of sight.
const YOU = "you-1"
const cam = (identity: string) => `${identity}|camera`
const share = (identity: string) => `${identity}|screen_share`

describe("pipOrder", () => {
  it("shows the newest screen someone else shares", () => {
    expect(pipOrder([cam(YOU), cam("ana"), cam("ben"), share("ana"), share("ben")], { speaker: "ana", you: YOU })[0]).toBe(share("ben"))
  })

  it("never shows your own share: the window would show itself inside it", () => {
    const order = pipOrder([cam(YOU), cam("ana"), share(YOU)], { you: YOU })
    expect(order).toEqual([cam("ana"), cam(YOU)])
  })

  it("then whoever spoke last, then everyone else in the call's order, then you", () => {
    expect(pipOrder([cam(YOU), cam("ana"), cam("ben"), cam("cy")], { speaker: "ben", you: YOU })).toEqual([cam("ben"), cam("ana"), cam("cy"), cam(YOU)])
  })

  it("never puts you first for having spoken", () => {
    expect(pipOrder([cam(YOU), cam("ana"), cam("ben")], { speaker: YOU, you: YOU })).toEqual([cam("ana"), cam("ben"), cam(YOU)])
  })

  it("shows you when you're alone", () => {
    expect(pipOrder([cam(YOU)], { you: YOU })).toEqual([cam(YOU)])
  })

  it("leaves out what is neither a camera nor a share, such as a board", () => {
    expect(pipOrder(["board:b1", cam("ana")], { you: YOU })).toEqual([cam("ana")])
  })
})

describe("lastSpeaker", () => {
  it("is whoever began speaking last, never you", () => {
    const at = (s: number) => new Date(Date.UTC(2026, 9, 31, 14, 0, s))
    expect(lastSpeaker([{ identity: "ana", lastSpokeAt: at(5) }, { identity: YOU, lastSpokeAt: at(9) }, { identity: "ben", lastSpokeAt: at(7) }], YOU)).toBe("ben")
  })

  it("is no one while no one else has spoken", () => {
    expect(lastSpeaker([{ identity: "ana" }, { identity: YOU, lastSpokeAt: new Date() }], YOU)).toBeNull()
  })
})

describe("pipVideo: a browser that can only pop out a <video>", () => {
  afterEach(() => document.body.replaceChildren())
  /** A stage tile as StageTile draws it, its picture playing (readyState 4) or not there at all. */
  const tile = (key: string, playing: boolean) => {
    const el = document.createElement("div")
    el.dataset.flipKey = key
    if (playing) {
      const video = document.createElement("video")
      Object.defineProperty(video, "readyState", { value: 4 })
      el.appendChild(video)
    }
    document.body.appendChild(el)
    return el
  }

  it("takes the first picture in the window's order that is playing", () => {
    tile(cam(YOU), true)
    tile(cam("ana"), false)
    const ben = tile(cam("ben"), true)
    expect(pipVideo(document, { speaker: "ana", you: YOU })).toBe(ben.querySelector("video"))
  })

  it("has none when every camera is off", () => {
    tile(cam("ana"), false)
    expect(pipVideo(document, { you: YOU })).toBeNull()
  })

  it("asks the browser for a small window: one 16:9 picture over a row of controls", () => {
    expect(CALL_PIP_SIZE.width / CALL_PIP_SIZE.height).toBeGreaterThan(1)
    expect(CALL_PIP_SIZE.width).toBeLessThanOrEqual(480)
  })
})
