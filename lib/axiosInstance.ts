import { errorToastCopy, shownRecently } from "@/lib/utils/errorToast";
import { endSession } from "@/lib/sessionEnd";
import axios from 'axios'
import store from "@/store/store"
import {updateRefreshTokenStatus} from "@/store/slice/refreshSlice";
import {loadingBus} from "@/lib/utils/loadingBus";
import { toast } from "@/hooks/use-toast";
import { noteNetworkFailure, noteNetworkOk } from "@/lib/connectivity";
import { tellReadFailure } from "@/lib/http/loadFailure";
import { onSessionRefreshed, refreshSession, sessionIsStale } from "@/lib/auth/sessionRefresh";
import { REQUEST_TIMEOUT_MS, isTimeout, waitsAsLongAsItTakes } from "@/lib/http/requestTimeout";

declare module "axios" {
    interface AxiosRequestConfig {
        /** The caller shows its own message for a failure, so the global error toast stays quiet. */
        suppressErrorToast?: boolean
    }
}

/** Pass as a request's config when the screen explains failures itself. */
export const OWN_ERRORS = { suppressErrorToast: true } as const

// --- Auth-token lifecycle ---
//
// The server issues a short-lived `Authorization` access cookie (5-minute
// TTL) alongside a long-lived `RefreshToken`. A purely REACTIVE refresh
// (wait for a 401, then refresh + retry) has a nasty failure mode: when a
// backgrounded tab comes back after the access token has expired, a *burst*
// of requests (SWR revalidation, MQTT reconnect, list reloads) all fire
// against the dead cookie at once. Each one logs a 401 in the console before
// the shared refresh resolves — the "401 storm" users hit on idle return.
//
// So we refresh PROACTIVELY as well:
//   1. One single-flight refresh (lib/auth/sessionRefresh refreshSession)
//      shared by every path and every tab, so N concurrent callers trigger
//      exactly ONE network refresh.
//   2. The request interceptor checks token age up-front; if we're inside the
//      pre-expiry skew window it awaits a refresh BEFORE the request leaves,
//      so the whole post-idle wave rides one fresh cookie (no 401s at all).
//   3. A visibility listener + low-frequency timer refresh while the tab is
//      active / on the moment it regains focus, covering non-axios consumers
//      (websocket/MQTT) that would otherwise reconnect with a stale cookie.
//   4. The reactive 401 → refresh → retry path remains as the backstop for
//      the edge where a token dies mid-flight despite the proactive window.

// The refresh itself, single-flight across this tab's requests and across
// tabs, and the shared time the cookie was issued: lib/auth/sessionRefresh
// (QA SH-16). The store hears each refresh.
onSessionRefreshed(() => {
    store.dispatch(updateRefreshTokenStatus({ exist: true }));
});

let isLoggingOut = false;

/**
 * The pages for someone outside the workspace, with no session at all: what a
 * guest link shares (/guest/d|t|b|c|m|p/<token>), a booking page and a booked
 * meeting (/book/<slug>, /booking/<token>), an intake form (/f/<token>), an
 * invitation to an event by email (/rsvp/<token>), a page published to the web
 * (/p/<slug>, its password and its copy) and unsubscribing. A 401 there is expected, never a session that ran out, so
 * nothing there refreshes a session or signs the browser out and sends it to
 * the sign-in page. That took a guest off the doc they were reading whenever a
 * node view asked the API for something, and, four minutes in, the refresh
 * timer below took a visitor off any of these pages, since every page loads
 * this client (the root layout's theme sync reaches it).
 */
export function onVisitorPage(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
    return /^\/(guest|book|booking|f|rsvp|p|unsubscribe)(\/|$)/.test(pathname);
}

// Proactive refresh that fails closed: if the refresh token itself is dead
// (user idle past the refresh TTL), tear the session down. Safe to call from
// fire-and-forget contexts (timer / visibility) — performLogout is guarded.
const proactiveRefresh = () => {
    if (isLoggingOut || onVisitorPage()) return;
    if (!sessionIsStale()) return;
    refreshSession().catch(async (err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
            await performLogout();
        }
    });
};

const clearClientCookies = () => {
    // Must match the Domain the server used when setting cookies
    // Server uses FE_DOMAIN (e.g., onecamp.onemana.dev)
    const cookieNames = ['Authorization', 'RefreshToken'];
    const hostname = window.location.hostname; // e.g., onecamp.onemana.dev
    const parts = hostname.split('.');
    const parentDomain = parts.length >= 2 ? '.' + parts.slice(-2).join('.') : '';

    // Clear with all possible domain variations
    const domains = ['', hostname, '.' + hostname, parentDomain];
    for (const name of cookieNames) {
        for (const domain of domains) {
            const domainPart = domain ? `; domain=${domain}` : '';
            document.cookie = `${name}=; Max-Age=0; path=/${domainPart}`;
        }
    }
};

const performLogout = async () => {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
        await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}logout`, {}, {
            withCredentials: true
        });
    } catch {
        // Logout call failed, still clear client state
    }
    // Let go of everything kept for the member before storage is cleared,
    // so nothing writes itself back on the way out (see lib/sessionEnd).
    await endSession();
    clearClientCookies();
    localStorage.clear();
    sessionStorage.clear();
    // Only redirect if not already on a public page to avoid reload loops
    const publicPaths = ['/', '/signup', '/forgot-password', '/reset-password', '/admin-setup'];
    if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = '/';
    } else {
        // We're already on a public page (e.g. login). Don't latch
        // isLoggingOut forever or the next authed request from the same
        // tab (e.g. /self_profile fired by AppProtectedRoute right after
        // demo-login succeeds) will be aborted by the request interceptor.
        isLoggingOut = false;
    }
};

const axiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
    withCredentials: true,
    // CSRF token: the BE writes a `X-CSRF-Token` cookie on every
    // response (scoped to the shared parent domain so this FE origin
    // can read it). Axios reads that cookie and echoes its value back
    // as a header on every state-changing request, satisfying the
    // double-submit-cookie pattern on the BE side.
    //
    // `withXSRFToken: true` is REQUIRED here. Since axios 1.6 the XSRF
    // header is only attached automatically for *same-origin* requests
    // unless this flag is set. Our FE (onecamp.onemana.dev) and BE
    // (onecamp-backend.onemana.dev) are different subdomains, i.e.
    // cross-origin, so without this flag axios silently drops the
    // header and every POST/PUT/PATCH/DELETE fails the BE CSRF check
    // with a 403.
    xsrfCookieName: 'X-CSRF-Token',
    xsrfHeaderName: 'X-CSRF-Token',
    withXSRFToken: true,
    timeout: REQUEST_TIMEOUT_MS,
});

/**
 * Browser cookie management is the source of truth for auth: requests carry
 * cookies via `withCredentials: true` whether or not JS can see them. We do
 * NOT pre-gate requests on `document.cookie` visibility — cookies set with
 * an explicit `Domain` attribute, on a subdomain, or via a proxy can be
 * stored in the browser's HTTP cookie jar but invisible to JS, and gating
 * on JS visibility kicks freshly-logged-in users straight back to the login
 * screen (e.g., after demo-login or OAuth callback).
 *
 * The response interceptor below handles a genuinely-missing/expired
 * cookie via a 401 → refreshToken → logout chain, which is the correct
 * authoritative signal.
 */

axiosInstance.interceptors.request.use(async req => {
    if (req.timeout === axiosInstance.defaults.timeout && waitsAsLongAsItTakes(req)) req.timeout = 0

    // Block all requests if we're in the middle of logging out
    if (isLoggingOut) {
        const controller = new AbortController();
        req.signal = controller.signal;
        controller.abort('FE: Logging out');
        return req;
    }

    // PROACTIVE refresh: if the access token is inside its pre-expiry window,
    // refresh BEFORE this request leaves. Concurrent requests share the single
    // in-flight refresh, so a post-idle burst rides one fresh cookie instead
    // of each 401-ing. A failure here is swallowed — the request proceeds and
    // the reactive 401 path below remains the authoritative backstop.
    // `skipAuthRefresh` lets internal/auth calls opt out; a visitor's page has
    // no session to refresh.
    // @ts-ignore
    if (!req.skipAuthRefresh && !onVisitorPage() && sessionIsStale()) {
        try {
            await refreshSession();
        } catch {
            // fall through to the request; reactive handler deals with 401
        }
    }

    // @ts-ignore — silent flag suppresses global loading bar for background polls
    if (!req.silent) {
        loadingBus.start();
    }

    // We deliberately do NOT pre-validate the auth cookie here. The browser
    // sends cookies via `withCredentials: true` regardless of JS visibility,
    // and a real 401 response is handled below.
    return req
})

/**
 * What a write that got no answer at all says. A read stays quiet: the
 * offline notice says the server can't be reached, once, and a page of
 * failed reads would otherwise raise a toast each. A write is the person's
 * own change, and it must not vanish without a word.
 */
const NO_ANSWER_TO_A_WRITE = {
    title: "Couldn't reach the server",
    description: "Your change wasn't saved. Check your connection and try again.",
}

const NO_ANSWER_IN_TIME = {
    title: "The server didn't answer in time",
    description: "Your change may not have been saved. Check before you try again.",
}

axiosInstance.interceptors.response.use(
    (response) => {
        // @ts-ignore
        if (!response.config.silent) {
            loadingBus.end();
        }
        noteNetworkOk();
        return response;
    },
    async (error) => {
        // @ts-ignore
        if (!error.config?.silent) {
            loadingBus.end();
        }
        const originalRequest = error.config;

        // Don't process anything if we're logging out
        if (isLoggingOut) {
            return Promise.reject(error);
        }

        // Any answer, even an error status, means the server is there. No
        // answer at all (and not a request this app cancelled) is a miss.
        if (error.response) {
            noteNetworkOk();
        } else if (!axios.isCancel(error) && error.code !== "ERR_CANCELED") {
            noteNetworkFailure();
            const method = String(error.config?.method || "get").toLowerCase();
            const copy = isTimeout(error) ? NO_ANSWER_IN_TIME : NO_ANSWER_TO_A_WRITE;
            if (method !== "get" && method !== "head" && !error.config?.suppressErrorToast && !shownRecently(copy)) {
                toast({ variant: "destructive", ...copy });
            }
        }

        // Standardized Error Toasting (excluding 401 refresh attempts).
        // A request may opt out via `suppressErrorToast` (e.g. an embedded
        // table whose target was deleted renders its own friendly fallback).
        // A write is the person's own change: its failure is said at once. A
        // read is said only when nothing on screen says it (lib/http/
        // loadFailure); useFetch's reads decide for themselves, so a failed
        // refresh under what is shown says nothing.
        // @ts-ignore
        if (error.response && error.response.status !== 401 && !error.config?.suppressErrorToast) {
            const method = String(error.config?.method || "get").toLowerCase();
            if (method === "get" || method === "head") {
                tellReadFailure(error);
            } else {
                const copy = errorToastCopy(error.response.status, error.response.data?.msg, error.response.data?.code)
                if (!shownRecently(copy)) {
                    toast({ variant: "destructive", ...copy });
                }
            }
        }

        if (error.response && error.response.status === 401 && !originalRequest._retry && !onVisitorPage()) {
            // Mark retry immediately to prevent duplicate refresh from this request
            originalRequest._retry = true;
            try {
                // Shares the single-flight refresh with any proactive/concurrent
                // attempt, so a 401 burst still triggers exactly one refresh.
                await refreshSession();
                return axiosInstance(originalRequest);
            }
            catch(err) {
                if (axios.isAxiosError(err) && err.response?.status === 401) {
                    await performLogout();
                }
                return Promise.reject(err);
            }
        }
        return Promise.reject(error)
    },
)

// Keep the access token warm while the tab is in use, and top it up the
// moment a backgrounded tab regains focus — both guarded by the pre-expiry
// window so they're no-ops until actually needed. This covers non-axios
// consumers (MQTT / collab websocket) that would otherwise reconnect on a
// stale cookie. Listeners are attached once at module load (client only).
if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            proactiveRefresh();
        }
    });
    // 60s cadence: browsers throttle timers in hidden tabs, which is fine —
    // the visibility listener handles the wake-up, and an active tab gets a
    // refresh within a minute of entering the pre-expiry window.
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            proactiveRefresh();
        }
    }, 60 * 1000);
}

export default axiosInstance
