import { describe, expect, it } from "vitest"
import { configureStore } from "@reduxjs/toolkit"
import userSlice, { updateUserInfoStatus } from "./userSlice"

// A presence event that changes nothing writes nothing: each one made a new
// object for the person and woke every selector reading them.
describe("updateUserInfoStatus", () => {
  it("leaves the person's entry untouched when nothing changed", () => {
    const store = configureStore({ reducer: { users: userSlice.reducer } })
    const ev = { userUUID: "maya", status: "online", profileKey: "k1", userName: "Maya Chen" }
    store.dispatch(updateUserInfoStatus(ev))
    const first = store.getState().users.usersStatus.maya
    store.dispatch(updateUserInfoStatus({ ...ev }))
    expect(store.getState().users.usersStatus.maya).toBe(first)
    store.dispatch(updateUserInfoStatus({ ...ev, status: "away" }))
    expect(store.getState().users.usersStatus.maya).not.toBe(first)
    expect(store.getState().users.usersStatus.maya.status).toBe("away")
  })
})
