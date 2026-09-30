import { describe, expect, it } from "vitest"
import { seatSummary } from "./seatSummary"

describe("seatSummary", () => {
    it("says nothing for an unlimited licence", () => {
        expect(seatSummary(300, 0)).toBeNull()
    })
    it("counts places left", () => {
        expect(seatSummary(10, 25)).toEqual({ tone: "ok", text: "Free plan: 10 of 25 people, 15 places left." })
        expect(seatSummary(24, 25)?.text).toContain("1 place left")
    })
    it("warns from 80%", () => {
        expect(seatSummary(20, 25)?.tone).toBe("near")
        expect(seatSummary(19, 25)?.tone).toBe("ok")
    })
    it("says plainly when it is full, even past the limit", () => {
        expect(seatSummary(25, 25)?.tone).toBe("full")
        expect(seatSummary(27, 25)?.tone).toBe("full")
    })
})
