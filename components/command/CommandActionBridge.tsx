"use client"

// CommandActionBridge centralizes every client-side directive that slash
// commands can emit (set presence, set status, DND, open search, open a DM /
// channel, toggle media, navigate). The command runner dispatches typed
// `CustomEvent`s; mounting this once near the app root keeps all the receivers
// in one auditable place instead of scattering listeners across components.
//
// Why a single bridge: commands like /away, /status, /dnd, /search, /dm,
// /collapse are conversation-independent and need app-level capabilities
// (Redux, router, the status dialog, notification preferences). A dedicated
// bridge component is the clean home for that wiring and matches how
// GlobalCommandHost handles async reminders.

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { updateUserStatus, updateUserConnectedDeviceCount } from "@/store/slice/userSlice"
import { useToast } from "@/hooks/use-toast"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { USER_STATUS_ONLINE, USER_STATUS_OFFLINE } from "@/types/user"
import type { RootState } from "@/store/store"
import type { ChannelAndUserListInterfaceResp, UserProfileInterface } from "@/types/user"

// dndKey persists the Do-Not-Disturb window so in-app notifications can be
// suppressed across reloads. Stored as the epoch ms until which DND is active
// (or "0" for indefinite while enabled).
const DND_UNTIL_KEY = "oc_dnd_until"

/** isDndActive reports whether DND is currently suppressing notifications. */
export function isDndActive(): boolean {
    try {
        const raw = localStorage.getItem(DND_UNTIL_KEY)
        if (!raw) return false
        const until = Number(raw)
        if (until === 0) return true // indefinite
        if (Number.isFinite(until) && until > Date.now()) return true
        // Expired — clean up.
        localStorage.removeItem(DND_UNTIL_KEY)
        return false
    } catch {
        return false
    }
}

// Resolve a free-text name to a matching user or channel from the search API.
// Returns the best-scored match (preferring an exact, case-insensitive name of
// the preferred type), or null when nothing matches.
async function resolveTarget(
    target: string,
    prefer: "user" | "channel",
): Promise<ChannelAndUserListInterfaceResp | null> {
    const q = target.replace(/^[@#]/, "").trim()
    if (!q) return null
    try {
        const res = await axiosInstance.post(PostEndpointUrl.SearchUserAndChannel, { search_text: q })
        const list = (res.data as { data?: ChannelAndUserListInterfaceResp[] })?.data
            ?? (res.data as ChannelAndUserListInterfaceResp[])
        if (!Array.isArray(list) || list.length === 0) return null

        const lowered = q.toLowerCase()
        const score = (it: ChannelAndUserListInterfaceResp): number => {
            const name = (it.type === "channel" ? it.channel_name : it.user_name)?.toLowerCase() ?? ""
            let s = 0
            if (name === lowered) s += 10
            else if (name.startsWith(lowered)) s += 5
            else if (name.includes(lowered)) s += 2
            if (it.type === prefer) s += 3
            return s
        }
        const best = [...list].sort((a, b) => score(b) - score(a))[0]
        // Require at least a partial match so a single unrelated result isn't
        // wrongly used.
        if (!best || score(best) <= 0) return null
        return best
    } catch {
        return null
    }
}

export default function CommandActionBridge() {
    const router = useRouter()
    const dispatch = useDispatch()
    const { toast } = useToast()
    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfUUID = selfProfile?.data?.user_uuid || ""
    // Live presence from Redux (kept current by MQTT + local updates) so the
    // idempotency check reflects the user's actual current state, not the
    // cached initial profile load.
    const liveStatus = useSelector(
        (s: RootState) => (selfUUID ? s.users.usersStatus[selfUUID]?.status : undefined),
    )

    useEffect(() => {
        // --- presence: /away, /active ---
        // The backend only accepts "online" | "offline" (there is no "away"
        // state). /away → offline, /active → online. We optimistically reflect
        // it in Redux so the user's own presence dot updates instantly; the
        // backend also fans the change out over MQTT to everyone else.
        const onPresence = (e: Event) => {
            const presence = (e as CustomEvent).detail?.presence as string
            const goOffline = presence === "away"
            const status = goOffline ? USER_STATUS_OFFLINE : USER_STATUS_ONLINE

            // Idempotency: if already in the requested state, just confirm.
            const current = liveStatus || selfProfile?.data?.user_status
            if (current === status) {
                toast({ title: goOffline ? "You're already away" : "You're already active" })
                return
            }

            axiosInstance
                .post(PostEndpointUrl.UpdateUserPresence, { user_status: status })
                .then(() => {
                    if (selfUUID) {
                        dispatch(updateUserStatus({ userUUID: selfUUID, status }))
                        // Going away forces the dot off even with live devices;
                        // going active restores at least one connected device so
                        // the green dot can show immediately.
                        dispatch(
                            updateUserConnectedDeviceCount({
                                userUUID: selfUUID,
                                deviceConnected: goOffline ? 0 : Math.max(1, selfProfile?.data?.user_device_connected || 1),
                            }),
                        )
                    }
                    toast({ title: goOffline ? "You're now away" : "You're now active" })
                })
                .catch(() => toast({ title: "Couldn't update presence", variant: "destructive" }))
        }

        // --- status: /status [emoji] [text] ---
        const onSetStatus = (e: Event) => {
            const detail = (e as CustomEvent).detail as { emoji?: string; text?: string }
            // Mapping a :shortcode: to an emoji UUID requires the emoji picker,
            // so we open the status dialog prefilled — the user confirms with
            // one click. This keeps the data model correct (emoji_id) without
            // guessing. The dialog reads its prefill from the UI payload.
            dispatch(
                openUI({
                    key: "userStatusUpdate",
                    data: { userUUID: "", prefillText: detail?.text || "", prefillEmoji: detail?.emoji || "" },
                }),
            )
        }
        const onOpenStatusPicker = () => {
            dispatch(openUI({ key: "userStatusUpdate", data: { userUUID: "" } }))
        }

        // --- DND: /dnd [duration], and "off" when duration cleared ---
        // DND does two things: (1) immediately suppress in-app notification
        // toasts for this client via a persisted DND-until window (read by
        // isDndActive in the FCM handler), and (2) persist quiet-hours so email
        // notifications respect it too. A bare "/dnd" with no duration toggles
        // DND OFF (clears the window + quiet hours).
        const onSetDnd = (e: Event) => {
            const detail = (e as CustomEvent).detail as { until?: string; display?: string }

            // No "until" → turn DND OFF.
            if (!detail?.until) {
                try {
                    localStorage.removeItem(DND_UNTIL_KEY)
                } catch { /* ignore */ }
                window.dispatchEvent(new CustomEvent("dnd-changed", { detail: { enabled: false } }))
                axiosInstance
                    .post(PostEndpointUrl.UpdateNotificationPreferences, { quiet_hours_enabled: false })
                    .catch(() => { /* best-effort */ })
                toast({ title: "Do Not Disturb is off" })
                return
            }

            const until = new Date(detail.until)
            try {
                localStorage.setItem(DND_UNTIL_KEY, String(until.getTime()))
            } catch { /* ignore */ }

            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
            const hhmm = (d: Date) =>
                `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
            axiosInstance
                .post(PostEndpointUrl.UpdateNotificationPreferences, {
                    quiet_hours_enabled: true,
                    quiet_hours_tz: tz,
                    quiet_hours_start: hhmm(new Date()),
                    quiet_hours_end: hhmm(until),
                })
                .catch(() => { /* best-effort: local DND already applied */ })

            window.dispatchEvent(new CustomEvent("dnd-changed", { detail: { enabled: true, until: detail.until } }))
            toast({
                title: "Do Not Disturb on",
                description: detail.display ? `Until ${detail.display}` : undefined,
            })
        }

        // --- navigation: /search, /shortcuts, /apps ---
        const onOpenSearch = (e: Event) => {
            const query = (e as CustomEvent).detail?.query as string
            router.push(`/app/search?query=${encodeURIComponent(query || "")}`)
        }
        const onOpenShortcuts = () => {
            // Reuse the global command palette as the shortcuts surface.
            document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
            )
        }
        const onOpenApps = () => router.push("/app/admin?tab=apps")

        // --- display: /collapse, /expand ---
        const onToggleMedia = (e: Event) => {
            const collapsed = Boolean((e as CustomEvent).detail?.collapsed)
            try {
                document.documentElement.setAttribute("data-media-collapsed", collapsed ? "true" : "false")
                localStorage.setItem("oc_media_collapsed", collapsed ? "true" : "false")
            } catch {
                /* ignore storage failures */
            }
            toast({ title: collapsed ? "Inline media collapsed" : "Inline media expanded" })
        }

        // --- open a DM / channel by name, optionally sending a message ---
        // /dm @person message  → resolve the user, navigate to the DM, and (if
        //   a message was provided) send it via the chat API.
        // /msg #channel message → resolve the channel, navigate, and send.
        const onOpenDm = async (e: Event) => {
            const detail = (e as CustomEvent).detail as { target?: string; message?: string; target_uuid?: string }
            if (!detail?.target && !detail?.target_uuid) return

            // Prefer the exact UUID captured from the composer's @mention node.
            let userUUID = (detail.target_uuid || "").trim()
            let userName = detail.target || "user"

            if (!userUUID) {
                const match = await resolveTarget(detail.target || "", "user")
                if (!match || match.type !== "user" || !match.user_uuid) {
                    toast({ title: `Couldn't find “@${(detail.target || "").replace(/^@/, "")}”`, variant: "destructive" })
                    return
                }
                userUUID = match.user_uuid
                userName = match.user_name || userName
            }

            const msg = (detail.message || "").trim()
            if (msg) {
                try {
                    await axiosInstance.post(PostEndpointUrl.CreateChatMessage, {
                        to_uuid: userUUID,
                        text_html: `<p>${escapeHtml(msg)}</p>`,
                        media_attachments: [],
                    })
                    toast({ title: `Message sent to ${userName}` })
                } catch {
                    toast({ title: "Couldn't send the message", variant: "destructive" })
                }
            }
            router.push(`/app/chat/${userUUID}`)
        }
        const onOpenChannel = async (e: Event) => {
            const detail = (e as CustomEvent).detail as { target?: string; message?: string }
            if (!detail?.target) return
            const match = await resolveTarget(detail.target, "channel")
            if (!match || match.type !== "channel" || !match.channel_uuid) {
                toast({ title: `Couldn't find “#${detail.target.replace(/^#/, "")}”`, variant: "destructive" })
                return
            }
            const msg = (detail.message || "").trim()
            if (msg) {
                try {
                    await axiosInstance.post(PostEndpointUrl.CreateChannelPost, {
                        channel_id: match.channel_uuid,
                        post_text_html: `<p>${escapeHtml(msg)}</p>`,
                        post_attachments: [],
                    })
                    toast({ title: `Message sent to #${match.channel_name || "channel"}` })
                } catch {
                    toast({ title: "Couldn't send the message", variant: "destructive" })
                }
            }
            router.push(`/app/channel/${match.channel_uuid}`)
        }

        window.addEventListener("set-presence", onPresence)
        window.addEventListener("set-status", onSetStatus)
        window.addEventListener("open-status-picker", onOpenStatusPicker)
        window.addEventListener("set-dnd", onSetDnd)
        window.addEventListener("open-search", onOpenSearch)
        window.addEventListener("open-shortcuts-modal", onOpenShortcuts)
        window.addEventListener("open-apps", onOpenApps)
        window.addEventListener("toggle-media-collapsed", onToggleMedia)
        window.addEventListener("open-dm-with", onOpenDm)
        window.addEventListener("open-channel-by-name", onOpenChannel)

        // Restore persisted media-collapse preference on mount.
        try {
            const saved = localStorage.getItem("oc_media_collapsed")
            if (saved) document.documentElement.setAttribute("data-media-collapsed", saved)
        } catch {
            /* ignore */
        }

        return () => {
            window.removeEventListener("set-presence", onPresence)
            window.removeEventListener("set-status", onSetStatus)
            window.removeEventListener("open-status-picker", onOpenStatusPicker)
            window.removeEventListener("set-dnd", onSetDnd)
            window.removeEventListener("open-search", onOpenSearch)
            window.removeEventListener("open-shortcuts-modal", onOpenShortcuts)
            window.removeEventListener("open-apps", onOpenApps)
            window.removeEventListener("toggle-media-collapsed", onToggleMedia)
            window.removeEventListener("open-dm-with", onOpenDm)
            window.removeEventListener("open-channel-by-name", onOpenChannel)
        }
    }, [router, dispatch, toast, selfUUID, liveStatus, selfProfile?.data?.user_status, selfProfile?.data?.user_device_connected])

    return null
}

// escapeHtml minimally escapes user-supplied slash-command message text before
// wrapping it in a <p> for the chat/post API.
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}
