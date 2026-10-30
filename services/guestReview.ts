import { publicCall } from "@/services/publicApi"

/** A client's verdict on the doc (a 403: view only; a 400: what to fix). Only the lazily loaded verdict uses it (GuestDocVerdict), so the guest page's first load doesn't carry it. */
export const reviewGuestDoc = (token: string, displayName: string, decision: "approved" | "changes", note: string) =>
    publicCall<{ review: { decision: string; name: string; note?: string; created_at: string } }>(`/guest/doc-review/${encodeURIComponent(token)}`, {
        method: "POST",
        body: JSON.stringify({ display_name: (displayName || "").trim(), decision, note }),
    })
