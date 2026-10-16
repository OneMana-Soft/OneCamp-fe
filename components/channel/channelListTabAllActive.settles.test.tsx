import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// Discover settles whatever its reads hand back. Its effect set the shown pages
// from every answer it was given, so an answer that was a new object each
// time (a revalidation, a mock) rendered it again, which set them again, for
// ever: a test worker spun until it was killed. The read below hands out a
// fresh object every call, and gives up after a bound, so a loop that comes
// back fails here, at once, instead of hanging the run.

const MAX_READS = 50
let reads = 0
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => {
        if (++reads > MAX_READS) throw new Error(`Discover read its page ${reads} times: it renders in a loop`)
        return {
            data: { channels_list: [{ ch_uuid: "c1", ch_name: "general" }], pageCount: 1, has_more: false },
            isLoading: false,
            isError: false,
            mutate: () => undefined,
        }
    },
}))
vi.mock("@/components/channel/chnnelListResult", () => ({
    ChannelListResult: ({ channelList }: { channelList: { ch_name: string }[] }) => (
        <ul>{channelList.map((c) => <li key={c.ch_name}>{c.ch_name}</li>)}</ul>
    ),
}))

const { ChannelListTabAllActive } = await import("@/components/channel/channelListTabAllActive")

afterEach(() => {
    cleanup()
    reads = 0
})

describe("Discover", () => {
    it("settles when every read hands back a new object", () => {
        const view = render(<ChannelListTabAllActive searchQuery="" />)
        expect(view.container.textContent).toContain("general")
        expect(reads).toBeLessThan(10)
    }, 5000)

    it("settles for a search too, and shows each channel once", () => {
        const view = render(<ChannelListTabAllActive searchQuery="gen" />)
        expect(view.getAllByText("general")).toHaveLength(1)
        expect(reads).toBeLessThan(10)
    }, 5000)
})
