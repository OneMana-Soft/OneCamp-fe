import { apiErrorMessage } from "@/lib/utils/apiError"
import { saysWriteFailure } from "@/lib/http/writeSaid"

/** A failed request's words, for a caller that says them itself: no shared toast says them again (V-397). */
export function saidHere(error: unknown, fallback = ""): string {
  saysWriteFailure(error)
  return apiErrorMessage(error, fallback)
}
