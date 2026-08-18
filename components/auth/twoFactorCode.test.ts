import { describe, it, expect } from "vitest"
import {
    AUTHENTICATOR_CODE_LENGTH,
    isCompleteAuthenticatorCode,
    normaliseTwoFactorCode,
} from "./TwoFactorCodeField"

/**
 * The entry rules for a second-factor code.
 *
 * Worth pinning because both formats are produced by the SERVER — six digits from RFC 6238, and
 * `XXXXX-XXXXX` base32 from models/postgres/User.NewRecoveryCode — so "what the field should accept" is
 * a contract with the backend, not a styling choice. A drift here shows up as a user with a correct code
 * on paper that the form refuses to let them finish typing, which is indistinguishable from a broken
 * account and is not something clicking around in dev reliably surfaces.
 */
describe("normaliseTwoFactorCode: authenticator codes", () => {
    it("keeps six digits", () => {
        expect(normaliseTwoFactorCode("123456", false)).toBe("123456")
    })

    it("recovers a code pasted with the surrounding text people actually paste", () => {
        // Authenticator apps and the notification shade both hand over more than the digits.
        expect(normaliseTwoFactorCode("123 456", false)).toBe("123456")
        expect(normaliseTwoFactorCode("code: 123456", false)).toBe("123456")
    })

    it("stops at six digits so a stray keystroke cannot extend a complete code", () => {
        expect(normaliseTwoFactorCode("1234567", false)).toBe("123456")
        expect(normaliseTwoFactorCode("1234567890", false)).toHaveLength(AUTHENTICATOR_CODE_LENGTH)
    })

    it("drops letters rather than accepting a value the server will reject", () => {
        expect(normaliseTwoFactorCode("abc123", false)).toBe("123")
    })
})

describe("normaliseTwoFactorCode: recovery codes", () => {
    it("accepts the server's display form unchanged", () => {
        // The exact shape NewRecoveryCode emits: two groups of five, hyphenated.
        expect(normaliseTwoFactorCode("A2B3C-D4E5F", true)).toBe("A2B3C-D4E5F")
    })

    it("uppercases, so the field matches the card being read from", () => {
        expect(normaliseTwoFactorCode("a2b3c-d4e5f", true)).toBe("A2B3C-D4E5F")
    })

    it("accepts a code typed without the hyphen", () => {
        // The server strips hyphens before hashing, so this is a legitimate way to enter one and must
        // not be blocked at the keystroke.
        expect(normaliseTwoFactorCode("A2B3CD4E5F", true)).toBe("A2B3CD4E5F")
    })

    it("drops characters outside base32, which are the transcription slips", () => {
        // Base32 has no 0, 1, 8 or 9 — that is why it was chosen for something typed off paper. A user
        // who reads O as 0 gets the character dropped rather than a rejected round trip.
        expect(normaliseTwoFactorCode("A0B1C-D8E9F", true)).toBe("ABC-DEF")
        expect(normaliseTwoFactorCode("A2B3C_D4E5F", true)).toBe("A2B3CD4E5F")
    })

    it("keeps the full display length, and no more", () => {
        // 11 = ten base32 characters plus the grouping hyphen. Truncating shorter would make a valid
        // pasted code unenterable; allowing more would accept something the server cannot match.
        expect(normaliseTwoFactorCode("A2B3C-D4E5F", true)).toHaveLength(11)
        expect(normaliseTwoFactorCode("A2B3C-D4E5FGHIJK", true)).toHaveLength(11)
    })

    it("does not silently truncate a space-separated paste below a full code", () => {
        // "A2B3C D4E5F" loses the space, leaving ten characters — a complete code. Capping at 11 after
        // filtering rather than before is what makes this work.
        expect(normaliseTwoFactorCode("A2B3C D4E5F", true)).toBe("A2B3CD4E5F")
    })
})

describe("isCompleteAuthenticatorCode", () => {
    it("is true only at exactly six digits", () => {
        expect(isCompleteAuthenticatorCode("12345", false)).toBe(false)
        expect(isCompleteAuthenticatorCode("123456", false)).toBe(true)
    })

    it("is never true in recovery mode, whatever the length", () => {
        // Auto-submitting a recovery code would fire mid-word: they are typed from paper, so a length
        // match is reached while the user is still going.
        expect(isCompleteAuthenticatorCode("A2B3C-", true)).toBe(false)
        expect(isCompleteAuthenticatorCode("A2B3C-D4E5F", true)).toBe(false)
    })
})
