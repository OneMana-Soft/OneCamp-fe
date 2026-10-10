import { describe, expect, it } from "vitest"

import store, { RESET_STORE_ACTION } from "@/store/store"
import { pruneStaleTyping, addChannelTyping } from "@/store/slice/typingSlice"
import { openUI } from "@/store/slice/uiSlice"
import type { UserProfileDataInterface } from "@/types/user"

// The root reducer is composed by hand. It built a new state object for every
// action, changed or not, so every useSelector in the app ran again on every
// dispatch (the typing sweep alone dispatches every 2 seconds), and any
// selector that returns a fresh value (`|| []`) re-rendered its component each
// time. It keeps the state object when nothing changed, as combineReducers does.
describe("the store's root reducer", () => {
  it("keeps the same state for an action no slice handles", () => {
    const before = store.getState()
    store.dispatch({ type: "nothing/handlesThis" })
    expect(store.getState()).toBe(before)
  })

  it("keeps the same state for a typing sweep with nothing to sweep", () => {
    const before = store.getState()
    store.dispatch(pruneStaleTyping({ ttlMs: 6000 }))
    expect(store.getState()).toBe(before)
  })

  it("changes only the slice an action changes", () => {
    const before = store.getState()
    store.dispatch(addChannelTyping({ channelId: "c1", user: { user_uuid: "u1" } as UserProfileDataInterface }))
    const after = store.getState()
    expect(after).not.toBe(before)
    expect(after.typing).not.toBe(before.typing)
    expect(after.channel).toBe(before.channel)
    expect(after.users).toBe(before.users)
    expect(after.ui).toBe(before.ui)
  })

  it("still rebuilds every slice on reset", () => {
    store.dispatch(openUI({ key: "channelFileUpload" }))
    const before = store.getState()
    store.dispatch({ type: RESET_STORE_ACTION })
    const after = store.getState()
    expect(after).not.toBe(before)
    expect(after.ui).not.toBe(before.ui)
    expect(after.typing.channelTyping).toEqual({})
  })
})
