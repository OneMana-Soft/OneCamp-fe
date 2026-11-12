import { afterEach, describe, expect, it, vi } from "vitest"
import { forgetShared, peekShared, sharedRequest } from "./sharedRequest"

afterEach(() => {
    for (const k of ["a", "b", "fail", "f1", "f2"]) forgetShared(k)
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

    // V-577: a read asked for because something may have changed (the live
    // connection is back) can't take the answer of a request sent before it.
    it("a fresh ask never joins a request already in flight, and an older answer that comes last never stands", async () => {
        const answers: Array<(v: string) => void> = []
        const fn = vi.fn(() => new Promise<string>((r) => answers.push(r)))
        const before = sharedRequest("f1", fn)
        const after = sharedRequest("f1", fn, { fresh: true })
        const joined = sharedRequest("f1", fn)
        expect(fn).toHaveBeenCalledTimes(2)
        answers[1]("new")
        answers[0]("old")
        await expect(after).resolves.toBe("new")
        await expect(joined).resolves.toBe("new")
        await expect(before).resolves.toBe("new")
        expect(peekShared("f1")).toBe("new")
    })

    it("gives the older request its own answer when it comes first", async () => {
        const answers: Array<(v: string) => void> = []
        const fn = vi.fn(() => new Promise<string>((r) => answers.push(r)))
        const before = sharedRequest("f2", fn)
        const after = sharedRequest("f2", fn, { fresh: true })
        answers[0]("old")
        await expect(before).resolves.toBe("old")
        answers[1]("new")
        await expect(after).resolves.toBe("new")
        expect(peekShared("f2")).toBe("new")
    })

    it("forgets on request", async () => {
        await sharedRequest("a", async () => 1)
        forgetShared("a")
        expect(peekShared("a")).toBeUndefined()
    })
})
