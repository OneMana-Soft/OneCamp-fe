import { describe, expect, it } from "vitest"
import { invitationAcceptedStale } from "./invitationLive"
import { MqttMessageType } from "@/services/mqttService"
import { AdminGet } from "@/services/endpoints/admin"

describe("an accepted invitation", () => {
  it("is the backend's type 44", () => {
    expect(MqttMessageType.Invitation_Accepted).toBe(44)
  })

  it("makes the invitations list and every page of the members list stale", () => {
    expect(invitationAcceptedStale(AdminGet.GetAdminInvitationList)).toBe(true)
    expect(invitationAcceptedStale(`${AdminGet.GetAdminUserList}?pageIndex=0&pageSize=20`)).toBe(true)
    expect(invitationAcceptedStale(`${AdminGet.GetAdminUserList}?pageIndex=3&pageSize=50`)).toBe(true)
  })

  it("leaves everything else alone", () => {
    expect(invitationAcceptedStale("/admin/import/jobs")).toBe(false)
    expect(invitationAcceptedStale("/admin/addInvitation")).toBe(false)
    expect(invitationAcceptedStale(["/admin/getAllUsersList"])).toBe(false)
    expect(invitationAcceptedStale(undefined)).toBe(false)
  })
})
