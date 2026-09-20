import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { downloadBlob } from "@/lib/utils/download"

vi.mock("@/lib/utils/download", () => ({ downloadBlob: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn() } }))

import axiosInstance from "@/lib/axiosInstance"
import { downloadMyAIRecord } from "@/services/aiActivityService"

// A row on a screen is something the workspace is telling you. The same row
// with the recipe for recomputing its hash is something you can check, and
// check somewhere else. The file is the difference between a claim and
// evidence, so it has to actually arrive.

describe("downloading your own AI record", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it("asks the member-scoped endpoint and saves what comes back", async () => {
        vi.mocked(axiosInstance.get).mockResolvedValue({ data: "{}" })
        await downloadMyAIRecord()

        const [url, opts] = vi.mocked(axiosInstance.get).mock.calls[0]
        // Member-scoped, never the admin log: this is the caller's own record.
        expect(url).toBe("/ai/activity/proof")
        expect(url).not.toContain("/admin")
        expect(opts).toMatchObject({ responseType: "blob" })

        expect(vi.mocked(downloadBlob)).toHaveBeenCalledWith("{}", "application/json", "onecamp-ai-record.json")
    })

    it("lets a failure reach the caller rather than saving an empty file", async () => {
        vi.mocked(axiosInstance.get).mockRejectedValue(new Error("nope"))
        await expect(downloadMyAIRecord()).rejects.toThrow()
        expect(vi.mocked(downloadBlob)).not.toHaveBeenCalled()
    })
})
