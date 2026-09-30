import { afterEach, describe, expect, it, vi } from "vitest"
import { forgetShared, peekShared, sharedRequest } from "./sharedRequest"

afterEach(() => {
    for (const k of ["a", "b", "fail"]) forgetShared(k)
})

describe("sharedRequest", () => {
    it("runs one request for concurrent callers", async () => {
        const fn = vi.fn(async () => 42)
        const [x, y] = await Promise.all([sharedRequest("a", fn), sharedRequest("a", fn)])
        expect(x).toBe(42)
        expect(y).toBe(42)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it("answers from the kept value while fresh, and asks again when told to", async () => {
        const fn = vi.fn(async () => "v")
        await sharedRequest("b", fn)
        await sharedRequest("b", fn)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(peekShared("b")).toBe("v")
        await sharedRequest("b", fn, { fresh: true })
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it("expires the kept value", async () => {
        await sharedRequest("b", async () => "v")
        expect(peekShared("b", 30_000, Date.now() + 31_000)).toBeUndefined()
    })

    it("never keeps a failure, so the next ask retries", async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce("ok")
        await expect(sharedRequest("fail", fn)).rejects.toThrow("blip")
        expect(peekShared("fail")).toBeUndefined()
        await expect(sharedRequest("fail", fn)).resolves.toBe("ok")
    })

    it("forgets on request", async () => {
        await sharedRequest("a", async () => 1)
        forgetShared("a")
        expect(peekShared("a")).toBeUndefined()
    })
})
