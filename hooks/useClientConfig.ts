"use client"

// useClientConfig exposes workspace client config (currently the upload limit)
// fetched once and cached by SWR. The composer/upload paths use it to validate
// a file's size BEFORE uploading, so the user gets an instant, precise message
// instead of waiting for a failed request.

import useSWR from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { CLIENT_CONFIG_KEY } from "@/lib/clientConfigKey"
import { onVisitorPage } from "@/lib/visitorPage"
import { GetEndpointUrl } from "@/services/endPoints"

export interface ClientConfig {
    upload_limit_mb: number
    upload_limit_bytes: number
    // Runtime transcription mode. Drives whether the browser Web-Speech
    // transcriber runs ("frontend"), defers to the server-side agent
    // ("backend"), or is disabled ("off"). Admin-controlled at runtime, so
    // it can change without a frontend rebuild.
    transcription_mode: "frontend" | "backend" | "off"
    // Which OPTIONAL subsystems this server actually has. A key is present only
    // when the subsystem is compiled in, and its value says whether it is usable
    // right now, so absent and false are different facts:
    //
    //   absent   this build does not have it. OneCamp v1 is built without the AI
    //            packages, so its AI routes do not exist at all.
    //   false    it exists but is switched off or unconfigured (on v2, an admin
    //            can turn AI off, and then every AI call fails).
    //
    // Either way the UI must not offer it. Gate on useFeature() below rather than
    // reading this directly, so both cases are handled the same way in one place.
    features?: Record<string, boolean>

    // Whether this workspace can send email at all.
    //
    // False on every freshly provisioned install until an admin adds a sending key:
    // the installer clears it deliberately so that nothing ever sends from a
    // customer's domain without them choosing to. Nothing else reveals it —
    // /auth/forgot-password answers "check your email" whether or not it could
    // send, so the failure is silent from the outside and the first person to find
    // out is an admin who locked themselves out.
    email_enabled: boolean
}

// These must match the FeatureName* constants in the backend's helpers package.
// Named constants on both sides because a typo fails SILENTLY here — an unknown
// feature reads as unavailable, so the mistake looks exactly like a server that
// does not have the subsystem.
//
// FEATURE_AI is absent entirely on the AI-free v1 edition.
export const FEATURE_AI = "ai"
// FEATURE_CALLS needs a LiveKit server, which the shipped compose file does not
// include — a self-hosted install has calls only if the operator runs one.
export const FEATURE_CALLS = "calls"
// FEATURE_PUSH needs Firebase credentials, which a self-hosted install with no
// mobile app of its own legitimately will not have.
export const FEATURE_PUSH = "push"
// FEATURE_GITHUB reports whether an admin has connected GitHub. It is a feature
// rather than a fetch because MEMBERS need the answer: the task panel decides
// whether to offer a pull-request affordance with it, and it used to ask
// /admin/github/status, which 403s for everyone who is not an admin.
export const FEATURE_GITHUB = "github"
// FEATURE_CALENDAR_REPEATS is whether the calendar's events are in its one
// store (calendar A1), where events repeat and a change to one instance asks
// its scope. Off (the two old stores, or while the events move), no repeat
// is offered: nothing would make one.
export const FEATURE_CALENDAR_REPEATS = "calendar_repeats"

// A sane default mirrors the backend default (10 MB) so validation still works
// before the config request resolves.
const DEFAULT_UPLOAD_LIMIT_MB = 10
export const DEFAULT_CONFIG: ClientConfig = {
    upload_limit_mb: DEFAULT_UPLOAD_LIMIT_MB,
    upload_limit_bytes: DEFAULT_UPLOAD_LIMIT_MB * 1024 * 1024,
    transcription_mode: "frontend",
    // No features until the server says otherwise, which makes optional subsystems
    // FAIL CLOSED while this request is in flight.
    //
    // Deliberately the opposite default to transcription_mode above. That one is
    // optimistic because guessing wrong costs a few seconds of local transcription.
    // Guessing wrong here paints AI buttons that a v1 server has no routes for, and
    // then removes them a moment later — so a customer who bought the AI-free
    // edition watches AI features flicker into existence on every page load. A
    // feature appearing 200ms late is a much smaller cost than one that appears and
    // then fails or vanishes.
    features: {},
    // Optimistic, like transcription_mode above and unlike features. Assuming email
    // works costs nothing if we are wrong for 200ms; assuming it is broken paints a
    // scary banner on every page load of every healthy workspace.
    email_enabled: true,
}

async function fetchClientConfig(): Promise<ClientConfig> {
    const res = await axiosInstance.get(GetEndpointUrl.GetClientConfig, {
        // @ts-expect-error — suppress the global loading bar for this background fetch
        silent: true,
    })
    const data = (res.data as { data?: Partial<ClientConfig> })?.data
    // Merge over defaults so a backend that hasn't shipped a field yet (or a
    // partial payload, or none) never yields an undefined transcription_mode.
    return { ...DEFAULT_CONFIG, ...data } as ClientConfig
}

// One SWR key, one set of options, shared by every reader below so they cannot
// drift into two caches of the same request.
//
// WHEN THE READ FAILS (17 Oct 2026). Everything optional reads as off until
// the server answers, and so it stayed when the read failed: a dark channel
// shot had no Huddle and no AI spark, and nobody was told. So:
//   - the answer is kept for the next load (lib/swrCache's KEPT), and a read
//     that fails keeps the features the last one gave, as SWR keeps data;
//   - a failure is asked again on its own, a few seconds apart, growing;
//   - with nothing known, FeaturesNotice says so and offers Try again.
export const CONFIG_RETRY = { interval: 3000, count: 6 }

// A visitor has no session (401): not asked, everything off.
function useClientConfigRequest() {
    const visitor = onVisitorPage()
    const request = useSWR(visitor ? null : CLIENT_CONFIG_KEY, fetchClientConfig, {
        revalidateOnFocus: false,
        dedupingInterval: 5 * 60 * 1000,
        // No fallbackData: SWR weighs a reply against it by value, so a server
        // with nothing optional (a reply equal to the defaults) drew nobody
        // again, and its readers waited on "unknown" (Home's list, 22 Oct).
        errorRetryInterval: CONFIG_RETRY.interval,
        errorRetryCount: CONFIG_RETRY.count,
    })
    return visitor ? { ...request, data: DEFAULT_CONFIG, error: undefined } : request
}

/**
 * Whether this server has said what it has, and whether asking failed: the
 * notice that says so when nothing is known (components/banner/FeaturesNotice).
 * `retry` asks again now.
 */
export function useClientConfigStatus(): { known: boolean; failed: boolean; retry: () => void } {
    const { data, error, mutate } = useClientConfigRequest()
    return { known: data !== undefined, failed: !!error, retry: () => void mutate() }
}

export function useClientConfig(): ClientConfig {
    const { data } = useClientConfigRequest()
    return data ?? DEFAULT_CONFIG
}

/**
 * The three answers to "does this server have that subsystem", where useFeature
 * gives two.
 *
 * Collapsing "not yet known" into "no" is right for a button: a control that
 * appears 200ms late costs nothing, and one that appears and then fails costs
 * trust. It is wrong for a whole ROUTE, because the same collapse means every
 * visit to a call page opens on "calling is not available here" and then
 * replaces it with the call, which reads as a broken product rather than a
 * careful one.
 *
 * So routes get the third state and decide for themselves: no reply yet is
 * "unknown".
 *
 * A failed read with nothing kept stays "unknown": a route waits on (Try again
 * is in FeaturesNotice), but a part that only holds its place passes onFailure
 * "unavailable", or it waits for good (Home's list, 22 Oct).
 */
type FeatureState = "unknown" | "available" | "unavailable"

export function useFeatureState(
    name: string,
    { onFailure = "unknown" }: { onFailure?: "unknown" | "unavailable" } = {},
): FeatureState {
    const { data, error } = useClientConfigRequest()
    if (!data) return error ? onFailure : "unknown"
    return data.features?.[name] === true ? "available" : "unavailable"
}

/**
 * useFeature reports whether an optional backend subsystem is available to use.
 *
 * Gate every entry point to an optional subsystem on this: a menu item, button or
 * panel that reaches a subsystem the server does not have is worse than nothing
 * there at all, because the user only finds out after clicking.
 *
 * Fails closed. An absent key (this build does not include the subsystem), an
 * explicit false (present but switched off), a request still in flight, and a
 * failed request all read as unavailable — every one of them means "do not offer
 * it", so collapsing them here keeps that judgement out of 30 call sites.
 *
 * Generic by name rather than a hook per subsystem, so a new optional subsystem
 * needs a constant and nothing else.
 */
export function useFeature(name: string): boolean {
    const { features } = useClientConfig()
    return features?.[name] === true
}

/**
 * useAIAvailable is the AI-specific reading of useFeature, and the hook every AI
 * entry point should call.
 *
 * It exists so that the string "ai" appears in ONE place on the frontend. It is
 * false on the AI-free v1 edition, whose build has no AI routes, and also on v2
 * whenever an admin has turned AI off or has not configured a provider.
 */
export function useAIAvailable(): boolean {
    return useFeature(FEATURE_AI)
}
