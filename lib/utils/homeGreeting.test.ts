import { describe, expect, it } from "vitest"
import { homeGreeting } from "./homeGreeting"

describe("homeGreeting", () => {
    it("greets by first name, by the time of day", () => {
        expect(homeGreeting(9, { user_full_name: "Priya Nair" })).toBe("Good morning, Priya")
        expect(homeGreeting(12, { user_full_name: "Priya Nair" })).toBe("Good afternoon, Priya")
        expect(homeGreeting(17, { user_full_name: "Priya Nair" })).toBe("Good afternoon, Priya")
        expect(homeGreeting(18, { user_full_name: "Priya Nair" })).toBe("Good evening, Priya")
        expect(homeGreeting(0, { user_full_name: "Priya" })).toBe("Good morning, Priya")
    })

    it("greets by the given name: the full name's first word over the display name's", () => {
        expect(homeGreeting(9, { user_name: "sam", user_full_name: "Sam Rivera" })).toBe("Good morning, Sam")
        expect(homeGreeting(9, { user_name: "Sam Rivera", user_full_name: "" })).toBe("Good morning, Sam")
    })

    it("says no name when there is none to go on, never the address", () => {
        expect(homeGreeting(9, { user_email_id: "lee@example.com" })).toBe("Good morning")
        expect(homeGreeting(9, { user_name: "", user_full_name: "   " })).toBe("Good morning")
        expect(homeGreeting(9)).toBe("Good morning")
    })

    it("ignores stray spacing", () => {
        expect(homeGreeting(9, { user_full_name: "  Maya   Chen " })).toBe("Good morning, Maya")
    })
})
