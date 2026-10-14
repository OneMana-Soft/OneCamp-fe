import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// What each upload told the server it was for.
const sent: Record<string, unknown>[] = []
vi.mock("@/lib/axiosInstance", () => ({
  OWN_ERRORS: { suppressErrorToast: true },
  default: {
    post: vi.fn(async (_url: string, form: FormData) => {
      sent.push(JSON.parse(String(form.get("jsonData"))))
      return { data: { object_uuid: "file-1" } }
    }),
  },
}))

// A group made here and not yet on the server ("new-group"), and one that is ("old-group").
const state = {
  groupChat: {
    locallyCreatedGrpInfo: {
      "new-group": {
        grpId: "new-group",
        haveSentFirstChat: false,
        participants: [{ user_uuid: "maya", uid: "0x1" }, { user_uuid: "sam", uid: "0x2" }, { user_uuid: "me", uid: "0x3" }],
      },
      "old-group": {
        grpId: "old-group",
        haveSentFirstChat: true,
        participants: [{ user_uuid: "maya", uid: "0x1" }, { user_uuid: "me", uid: "0x3" }, { user_uuid: "ali", uid: "0x4" }],
      },
    },
  },
}
vi.mock("react-redux", () => ({ useDispatch: () => () => undefined, useStore: () => ({ getState: () => state }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => undefined }) }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ upload_limit_bytes: 1 << 30, upload_limit_mb: 1024 }) }))

const { useUploadFile } = await import("@/hooks/useUploadFile")

function files(): FileList {
  return [new File(["the plan"], "plan.txt", { type: "text/plain" })] as unknown as FileList
}

// A group is made on the server by its first message, and its id is made from its people before
// then. The server lets a file into a group only for someone in it, and can't ask a group it
// doesn't have yet: a file added before the first message went names the group's people, by
// their account ids, which make the group's id.
describe("a file for a group", () => {
  it("names the people of a group not on the server yet", async () => {
    sent.length = 0
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToGroupChat(files(), "new-group")
    expect(sent).toEqual([{ src_key: "grpChat", src_value: "new-group", participants: ["maya", "sam", "me"] }])
  })

  it("names nobody for a group the server has", async () => {
    sent.length = 0
    const { result } = renderHook(() => useUploadFile())
    await result.current.makeRequestToUploadToGroupChat(files(), "old-group")
    await result.current.makeRequestToUploadToGroupChat(files(), "someone-elses-group")
    expect(sent).toEqual([
      { src_key: "grpChat", src_value: "old-group" },
      { src_key: "grpChat", src_value: "someone-elses-group" },
    ])
  })
})
