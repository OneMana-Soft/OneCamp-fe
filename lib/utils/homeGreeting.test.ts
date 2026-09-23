import { describe, expect, it } from "vitest"
import { homeGreeting } from "./homeGreeting"

describe("homeGreeting", () => {
    it("greets by first name, by the time of day", () => {
        expect(homeGreeting(9, "Priya Nair", "priya")).toBe("Good morning, Priya")
        expect(homeGreeting(12, "Priya Nair")).toBe("Good afternoon, Priya")
        expect(homeGreeting(17, "Priya Nair")).toBe("Good afternoon, Priya")
        expect(homeGreeting(18, "Priya Nair")).toBe("Good evening, Priya")
        expect(homeGreeting(0, "Priya")).toBe("Good morning, Priya")
    })

    it("falls back to the username, then to no name at all", () => {
        expect(homeGreeting(9, "", "Sam Rivera")).toBe("Good morning, Sam")
        expect(homeGreeting(9, "   ", "")).toBe("Good morning")
        expect(homeGreeting(9)).toBe("Good morning")
    })

    it("ignores stray spacing", () => {
        expect(homeGreeting(9, "  Maya   Chen ")).toBe("Good morning, Maya")
    })
})
