import { describe, expect, it } from "vitest"

import { MIN_TILE, presentationOrder, stageLayout, type StageInput } from "./stageLayout"

// Stage Layout (A4, #54; meet-17, meet-14 and zoom-03): one pure function says
// what the call's stage draws, so the call and its recording (S4) draw the
// same. Meet draws up to 49 tiles and several presenters; ours drew LiveKit's
// table (5x5 at most, two tiles on a phone) and the first share alone.

/** `n` people's cameras, in the call's order. */
const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}|camera`)
/** Someone's shared screen. */
const share = (who: string) => `${who}|screen_share`
const at = (w: number, h: number) => ({ w, h })
const layout = (over: Partial<StageInput>) => stageLayout({ tiles: [], presenting: [], mode: "grid", viewport: at(1920, 1080), ...over })

describe("the grid", () => {
  it("holds up to 7x7 on a page: 49 people at 1920x1080 on one page, 50 on two, the second holding one", () => {
    const one = layout({ tiles: people(49) }).grid!
    expect([one.cols, one.rows, one.pages, one.keys.length]).toEqual([7, 7, 1, 49])
    const two = layout({ tiles: people(50), page: 1 }).grid!
    expect([two.cols, two.rows, two.pages, two.page]).toEqual([7, 7, 2, 1])
    expect(two.keys).toEqual(["p50|camera"])
  })

  it("never goes past 7x7 nor draws a tile under 160x90, and a big call goes 49 to a page", () => {
    for (const viewport of [at(1280, 720), at(1920, 1080)]) {
      for (let n = 1; n <= 120; n++) {
        const g = layout({ tiles: people(n), viewport }).grid!
        expect(Math.max(g.cols, g.rows), `${n} people at ${viewport.w}x${viewport.h}`).toBeLessThanOrEqual(7)
        expect(g.tile.w, `${n} people at ${viewport.w}x${viewport.h}`).toBeGreaterThanOrEqual(MIN_TILE.w)
        expect(g.tile.h, `${n} people at ${viewport.w}x${viewport.h}`).toBeGreaterThanOrEqual(MIN_TILE.h)
        expect(g.cols * g.rows).toBeGreaterThanOrEqual(g.keys.length)
      }
    }
    const big = layout({ tiles: people(120), viewport: at(3840, 2160) }).grid!
    expect([big.cols, big.rows, big.pages]).toEqual([7, 7, 3])
  })

  it("a page past the last shows the last, and one before the first shows the first", () => {
    const g = layout({ tiles: people(50), page: 9 }).grid!
    expect([g.page, g.pages]).toEqual([1, 2])
    expect(g.keys).toEqual(["p50|camera"])
    expect(layout({ tiles: people(3), page: -2 }).grid!.page).toBe(0)
  })

  it("puts what is presented first, then everyone in the call's order", () => {
    expect(layout({ tiles: people(3), presenting: [share("p2")] }).grid!.keys).toEqual([share("p2"), "p1|camera", "p2|camera", "p3|camera"])
  })
})

describe("several sharers", () => {
  it("puts every share on the stage together, oldest first and as big as they fit; past four the oldest waits in the strip", () => {
    const two = layout({ mode: "speaker", tiles: people(6), presenting: [share("p2"), share("p5")] })
    expect(two.focus.keys).toEqual([share("p2"), share("p5")])
    // One above the other where that draws them bigger, side by side where that does.
    expect([two.focus.cols, two.focus.rows]).toEqual([1, 2])
    const wide = layout({ mode: "speaker", tiles: people(6), presenting: [share("p2"), share("p5")], viewport: at(2560, 720) })
    expect([wide.focus.cols, wide.focus.rows]).toEqual([2, 1])
    expect(two.strip.keys).toEqual(people(6))

    const five = layout({ mode: "speaker", tiles: people(6), presenting: ["p1", "p2", "p3", "p4", "p5"].map(share) })
    // The fifth began last, so it takes the stage, as any share that begins does.
    expect(five.focus.keys).toEqual(["p2", "p3", "p4", "p5"].map(share))
    expect([five.focus.cols, five.focus.rows]).toEqual([2, 2])
    expect(five.strip.keys[0]).toBe(share("p1"))
    // A phone's stage holds one: the newest.
    const phone = layout({ mode: "speaker", tiles: people(6), presenting: [share("p2"), share("p5")], viewport: at(366, 600) })
    expect(phone.focus.keys).toEqual([share("p5")])
    expect(phone.strip.keys[0]).toBe(share("p2"))
  })
})

describe("who takes the stage", () => {
  it("a share that begins takes it from your pin, the second sharer's too; a pin you choose after outranks the shares, they the spotlight, it the speaker, and the speaker the first tile", () => {
    const first = presentationOrder([], [share("p2")])
    expect(first).toEqual({ order: [share("p2")], began: true })
    // The call lists people in its own order, not by when they began sharing.
    const second = presentationOrder(first.order, [share("p5"), share("p2")])
    expect(second).toEqual({ order: [share("p2"), share("p5")], began: true })
    const same = presentationOrder(second.order, [share("p2"), share("p5")])
    expect(same.began).toBe(false)
    expect(same.order).toBe(second.order)
    expect(presentationOrder(second.order, [share("p5")])).toEqual({ order: [share("p5")], began: false })

    const call = { mode: "speaker" as const, tiles: people(5), spotlight: "p4|camera", speaker: "p5|camera" }
    expect(layout({ ...call, presenting: second.order, pin: "p3|camera" }).focus.keys).toEqual(["p3|camera"])
    expect(layout({ ...call, presenting: second.order }).focus.keys).toEqual([share("p2"), share("p5")])
    expect(layout(call).focus.keys).toEqual(["p4|camera"])
    expect(layout({ ...call, spotlight: null }).focus.keys).toEqual(["p5|camera"])
    // A pin on someone who has left is no pin.
    expect(layout({ ...call, spotlight: null, speaker: null, pin: "gone|camera" }).focus.keys).toEqual(["p1|camera"])
  })

  it("the board put up last takes the stage alone, and a share begun after it takes the stage back", () => {
    const board = "board:b1"
    const up = layout({ mode: "speaker", tiles: people(4), presenting: [share("p2"), board], board })
    expect(up.focus.keys).toEqual([board])
    expect(up.strip.keys[0]).toBe(share("p2"))
    const back = layout({ mode: "speaker", tiles: people(4), presenting: [board, share("p2")], board })
    expect(back.focus.keys).toEqual([share("p2")])
    expect(back.strip.keys[0]).toBe(board)
  })
})

describe("the strip", () => {
  it("on a phone holds three and +N for the rest, and four when they are all (never a +1)", () => {
    const nine = layout({ mode: "speaker", tiles: people(9), viewport: at(366, 600), speaker: "p4|camera" })
    expect(nine.focus.keys).toEqual(["p4|camera"])
    expect(nine.strip.keys).toEqual(["p1|camera", "p2|camera", "p3|camera"])
    expect([nine.strip.more, nine.strip.w]).toEqual([5, 104])
    const five = layout({ mode: "speaker", tiles: people(5), viewport: at(366, 600) })
    expect([five.strip.keys.length, five.strip.more]).toEqual([4, 0])
  })

  it("on a wide stage holds what fits, then +N; beside the board on a phone it steps aside", () => {
    // 200 px tiles are 112.5 tall: six places in 720 with 8 between, so five people and "+6".
    const wide = layout({ mode: "speaker", tiles: people(12), viewport: at(1280, 720) })
    expect([wide.strip.w, wide.strip.keys.length, wide.strip.more]).toEqual([200, 5, 6])
    const board = "board:b1"
    const phone = layout({ mode: "speaker", tiles: people(4), presenting: [board], board, viewport: at(366, 600) })
    expect(phone.focus.keys).toEqual([board])
    expect([phone.strip.keys, phone.strip.more]).toEqual([[], 0])
  })

  it("draws a phone's places square, so a face and its name plate both fit, as many as the stage's height takes; a wide stage's are 16:9", () => {
    // DESIGN-BUILD-54: a phone's 104x58 places cut the face's avatar at the top and put the name plate over it.
    const nine = layout({ mode: "speaker", tiles: people(9), viewport: at(366, 600), speaker: "p4|camera" })
    expect(nine.strip.tile).toEqual({ w: 104, h: 104 })
    // 300 px of a phone's stage holds two squares with 8 between: one person and "+7".
    const short = layout({ mode: "speaker", tiles: people(9), viewport: at(366, 300), speaker: "p4|camera" })
    expect([short.strip.keys.length, short.strip.more]).toEqual([1, 7])
    const wide = layout({ mode: "speaker", tiles: people(12), viewport: at(1280, 720) })
    expect(wide.strip.tile).toEqual({ w: 200, h: 112 })
  })
})

describe("a shared screen on a phone's stage (V-233)", () => {
  it("takes the stage's width, the strip under it a row of its four square places as wide as the row allows, in a busy call and an empty one", () => {
    // DESIGN-BUILD-71: beside the 104 px strip, a 366 px stage drew a slide 254 px wide (254x143 in a 254x700 column).
    const busy = layout({ mode: "speaker", tiles: people(12), presenting: [share("p2")], viewport: at(366, 640) })
    expect(busy.focus.keys).toEqual([share("p2")])
    expect(busy.focus.tile).toEqual({ w: 366, h: 205 })
    expect(busy.strip.below).toBe(true)
    // Four 85 px squares and three gaps of 8 fill the 366 px row: three people and "+9", as the strip holds beside a person.
    expect(busy.strip.tile).toEqual({ w: 85, h: 85 })
    expect([busy.strip.keys, busy.strip.more, busy.strip.w]).toEqual([["p1|camera", "p2|camera", "p3|camera"], 9, 366])
    // Two in the call: both under the share, in places as big as a busy call's.
    const empty = layout({ mode: "speaker", tiles: people(2), presenting: [share("p2")], viewport: at(366, 640) })
    expect([empty.focus.tile.w, empty.strip.below, empty.strip.keys.length, empty.strip.more, empty.strip.tile.w]).toEqual([366, true, 2, 0, 85])
    // A wider phone's row: the same four places, each as wide as the row allows.
    const wider = layout({ mode: "speaker", tiles: people(12), presenting: [share("p2")], viewport: at(560, 900) })
    expect([wider.focus.tile.w, wider.strip.tile.w, wider.strip.keys.length, wider.strip.more]).toEqual([560, 134, 3, 9])
  })

  it("moves no one out of the strip as a share begins: the row under it holds the three people the strip beside a camera held", () => {
    // V-233's first cut sized the row's places at the side strip's 104 px or more, so a 366 px row held three places: two
    // people and "+N". The third person the strip had shown went behind "+N" as a share began (e2e callStageLayout at
    // 390: "Show Jo Park" was gone). The row keeps the strip's places: three people and "+N", or four when they are all.
    const call = { mode: "speaker" as const, tiles: people(6), viewport: at(366, 640) }
    const talking = layout({ ...call, speaker: "p6|camera" })
    const sharing = layout({ ...call, presenting: [share("p6")] })
    expect([talking.strip.below, talking.strip.keys]).toEqual([false, ["p1|camera", "p2|camera", "p3|camera"]])
    expect([sharing.strip.below, sharing.strip.keys, sharing.strip.more]).toEqual([true, talking.strip.keys, 3])
    // The smallest phones too: a 296 px stage's row is four 68 px squares, not one person and "+5".
    const small = layout({ ...call, presenting: [share("p6")], viewport: at(296, 560) })
    expect([small.strip.below, small.strip.keys.length, small.strip.more, small.strip.tile.w, small.focus.tile.w]).toEqual([true, 3, 3, 68, 296])
  })

  it("holds for a share you pinned; a camera in focus keeps the strip beside it, the board the whole stage, a wide stage its strip beside", () => {
    const pinned = layout({ mode: "speaker", tiles: people(6), presenting: [share("p2"), share("p5")], pin: share("p2"), viewport: at(366, 640) })
    expect([pinned.focus.keys, pinned.focus.tile.w, pinned.strip.below]).toEqual([[share("p2")], 366, true])
    expect(pinned.strip.keys[0]).toBe(share("p5"))
    // DESIGN-BUILD-54's phone strip stays as it was for a person in focus: three and "+5" beside them.
    const camera = layout({ mode: "speaker", tiles: people(9), viewport: at(366, 640), speaker: "p4|camera" })
    expect([camera.strip.below, camera.strip.w, camera.strip.keys.length, camera.strip.more, camera.focus.tile.w]).toEqual([false, 104, 3, 5, 254])
    const board = "board:b1"
    const up = layout({ mode: "speaker", tiles: people(4), presenting: [board], board, viewport: at(366, 640) })
    expect([up.strip.below, up.strip.keys, up.strip.more, up.focus.tile.w]).toEqual([false, [], 0, 366])
    const wide = layout({ mode: "speaker", tiles: people(12), presenting: [share("p2")], viewport: at(1280, 720) })
    expect([wide.strip.below, wide.strip.w]).toEqual([false, 200])
    // A wide stage held upright (a tablet's) keeps its strip beside the share too, as before V-233.
    const upright = layout({ mode: "speaker", tiles: people(12), presenting: [share("p2")], viewport: at(744, 900) })
    expect([upright.strip.below, upright.strip.w, upright.focus.tile.w]).toEqual([false, 200, 536])
    expect(layout({ tiles: people(4), presenting: [share("p2")], viewport: at(366, 640) }).strip.below).toBe(false)
  })

  it("keeps the strip beside a share where a row under it would draw the share smaller: a short stage", () => {
    // 366x220: under an 85 px row the share has 127 px of height, so 225 wide; beside the strip it draws 254.
    const short = layout({ mode: "speaker", tiles: people(4), presenting: [share("p2")], viewport: at(366, 220) })
    expect([short.strip.below, short.strip.w, short.focus.tile.w]).toEqual([false, 104, 254])
  })
})
