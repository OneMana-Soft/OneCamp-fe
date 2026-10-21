// Keys an accepted invitation (MQTT 44) makes stale.
import { AdminGet as E } from "@/services/endpoints/admin"

export const invitationAcceptedStale = (key: unknown): boolean =>
  typeof key === "string" &&
  (key === E.GetAdminInvitationList || key === E.GetAdminUserList || key.startsWith(`${E.GetAdminUserList}?`))
