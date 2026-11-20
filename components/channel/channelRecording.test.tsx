// A channel's recordings: who gets the recording's Delete (and with it a
// pencil on every transcript line). The server's inChannel() allows the
// channel's moderators (ch_is_admin) OR a workspace admin (user_is_admin);
// the host mirrors both.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const seen = vi.hoisted(() => ({ chIsAdmin: 0 as number | boolean, userIsAdmin: false, onDelete: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { channel_info: { ch_uuid: "ch1", ch_name: "launch", ch_is_admin: seen.chIsAdmin } } }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-me", user_is_admin: seen.userIsAdmin } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/components/recording/RecordingsView", () => ({
  RecordingsView: (props: { onDelete?: unknown }) => {
    seen.onDelete = props.onDelete
    return null
  },
}))

import { ChannelRecording } from "./channelRecording"

afterEach(cleanup)

describe("a channel's recordings: the Delete right is the server's inChannel()", () => {
  const cases: [string, number | boolean, boolean, boolean][] = [
    ["a channel moderator", 1, false, true],
    ["a workspace admin who isn't a moderator (ch_is_admin 0, user_is_admin true)", 0, true, true],
    ["a plain member", 0, false, false],
  ]
  it.each(cases)("%s", (_who, chIsAdmin, userIsAdmin, may) => {
    seen.chIsAdmin = chIsAdmin
    seen.userIsAdmin = userIsAdmin
    seen.onDelete = undefined
    render(<ChannelRecording channelId="ch1" />)
    expect(typeof seen.onDelete === "function").toBe(may)
  })
})
