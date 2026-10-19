import { describe, expect, it } from "vitest"
import { docLoadFailure, hostedPlace } from "./docLoadFailure"

const refused = (status: number, data?: unknown) => ({ response: { status, data } })

describe("hostedPlace", () => {
    // A table row's page opened as a doc: the doc page takes its reader to the
    // row, by the path the server gave, and only to a path inside the app.
    it("says where a doc that belongs to a row is, for the doc page to go there", () => {
        expect(hostedPlace(refused(403, { code: "hosted", msg: "This page belongs to a row of Deals. Change it there.", path: "/app/tables/t1?row=r1" }))).toEqual({
            msg: "This page belongs to a row of Deals. Change it there.",
            path: "/app/tables/t1?row=r1",
        })
    })

    it("follows no path outside the app, and no other refusal", () => {
        for (const path of ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "/app/ x", "/docs/x", "/app/../x", "/app/tables/../../x", "/app/./tables", "/app/tables/..", 42]) {
            expect(hostedPlace(refused(403, { code: "hosted", msg: "m", path }))).toBeNull()
        }
        expect(hostedPlace(refused(403, { code: "no_access", path: "/app/tables/t" }))).toBeNull()
        expect(hostedPlace(refused(404, { code: "hosted", path: "/app/tables/t" }))).toBeNull()
        expect(hostedPlace(undefined)).toBeNull()
        expect(hostedPlace(new Error("offline"))).toBeNull()
    })
})

describe("docLoadFailure", () => {
    it("tells a doc in the trash, one the server refused, and no answer apart", () => {
        expect(docLoadFailure(refused(410))).toBe("deleted")
        expect(docLoadFailure(refused(403))).toBe("gone")
        expect(docLoadFailure(refused(503))).toBe("unreachable")
        expect(docLoadFailure(new Error("Network Error"))).toBe("unreachable")
    })
})
