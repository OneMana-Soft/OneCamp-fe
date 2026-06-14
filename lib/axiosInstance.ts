import axios from 'axios'
import store from "@/store/store"
import {updateRefreshTokenStatus} from "@/store/slice/refreshSlice";
import {loadingBus} from "@/lib/utils/loadingBus";
import { toast } from "@/hooks/use-toast";

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
//   1. A single-flight `refreshAccessToken()` shared by every path, so N
//      concurrent callers trigger exactly ONE network refresh.
//   2. The request interceptor checks token age up-front; if we're inside the
//      pre-expiry skew window it awaits a refresh BEFORE the request leaves,
//      so the whole post-idle wave rides one fresh cookie (no 401s at all).
//   3. A visibility listener + low-frequency timer refresh while the tab is
//      active / on the moment it regains focus, covering non-axios consumers
//      (websocket/MQTT) that would otherwise reconnect with a stale cookie.
//   4. The reactive 401 → refresh → retry path remains as the backstop for
//      the edge where a token dies mid-flight despite the proactive window.

// Access cookie TTL is 5 min (server: authCookieExpiryTime). Refresh a little
// ahead of that so a request never leaves on an about-to-die token.
const ACCESS_TTL_MS = 5 * 60 * 1000;
const REFRESH_SKEW_MS = 45 * 1000;
const PROACTIVE_AFTER_MS = ACCESS_TTL_MS - REFRESH_SKEW_MS; // ~4m15s

// Best-effort issuance clock. Initialised at module load (a fresh page load
// implies a fresh cookie or one that will 401 once and reset this), and reset
// on every successful refresh. Active use does NOT extend a JWT's exp, so we
// key staleness off issuance time, not last activity.
let tokenIssuedAt = Date.now();

let isLoggingOut = false;

// Single-flight refresh: concurrent callers share one in-flight promise.
let refreshPromise: Promise<void> | null = null;

const refreshAccessToken = (): Promise<void> => {
    if (refreshPromise) return refreshPromise;
    refreshPromise = axios
        .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}refreshToken`, { withCredentials: true })
        .then(() => {
            tokenIssuedAt = Date.now();
            store.dispatch(updateRefreshTokenStatus({ exist: true }));
        })
        .finally(() => {
            refreshPromise = null;
        });
    return refreshPromise;
};

// Proactive refresh that fails closed: if the refresh token itself is dead
// (user idle past the refresh TTL), tear the session down. Safe to call from
// fire-and-forget contexts (timer / visibility) — performLogout is guarded.
const proactiveRefresh = () => {
    if (isLoggingOut || refreshPromise) return;
    if (Date.now() - tokenIssuedAt < PROACTIVE_AFTER_MS) return;
    refreshAccessToken().catch(async (err) => {
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
    // `skipAuthRefresh` lets internal/auth calls opt out.
    // @ts-ignore
    if (!req.skipAuthRefresh && Date.now() - tokenIssuedAt >= PROACTIVE_AFTER_MS) {
        try {
            await refreshAccessToken();
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

axiosInstance.interceptors.response.use(
    (response) => {
        // @ts-ignore
        if (!response.config.silent) {
            loadingBus.end();
        }
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

        // Standardized Error Toasting (excluding 401 refresh attempts)
        if (error.response && error.response.status !== 401) {
            toast({
                variant: "destructive",
                title: "In-App Error",
                description: error.response.data?.msg || error.message || "An unexpected error occurred",
            });
        }

        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            // Mark retry immediately to prevent duplicate refresh from this request
            originalRequest._retry = true;
            try {
                // Shares the single-flight refresh with any proactive/concurrent
                // attempt, so a 401 burst still triggers exactly one refresh.
                await refreshAccessToken();
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
