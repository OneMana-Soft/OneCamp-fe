import { withCsrfHeader } from "@/lib/utils/csrf";

/**
 * How long a signed-out page waits for the server to answer a question it asks
 * before it can draw (is somebody signed in, which ways in are on, does this
 * server need an admin) before it goes on as if the answer were "no".
 *
 * Those questions had no limit, so an API that accepted the connection and then
 * hung left the sign-in page blank for good. Eight seconds is far past a slow
 * answer and short enough that the person is still there when the page shows.
 */
export const PROBE_TIMEOUT_MS = 8_000;

/**
 * Runs `work` with a signal, and stops waiting for it after `ms`.
 *
 * The request is aborted, so a browser lets go of the connection, AND raced, so
 * work that ignores its signal (a body that never finishes, a stub in a test)
 * still stops being waited for. Rejects when the time is up; callers catch that
 * as they catch a failed request.
 */
async function within<T>(work: (signal: AbortSignal) => Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeUp = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`no answer within ${ms}ms`));
        }, ms);
    });
    try {
        return await Promise.race([work(controller.signal), timeUp]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The three outcomes of a password submission.
 *
 * `totp_required` is the one worth naming: the password was CORRECT and the user is still not signed in.
 * It arrives as HTTP 200 with no cookies, so any shape that reduces this to a boolean reports it as
 * success — see loginWithEmail for what that cost.
 */
export type LoginOutcome =
    /** landing: where someone who has just joined opens (lib/landing.ts); absent for everyone else. */
    | { status: 'success'; landing?: string }
    | { status: 'totp_required'; challenge: string; msg: string }
    | { status: 'failed'; msg: string; auth_method?: string };

/**
 * What the server says to a password, for both sign-ins that send one: the email password and the
 * directory's (LDAP). Both ask for the second step the same way.
 *
 * `totp_required` is checked BEFORE `ok`, because that case IS a 200. Ordering it after would let the
 * success branch claim it.
 */
function loginOutcome(ok: boolean, data: { status?: string; challenge?: string; msg?: string; auth_method?: string; landing?: string } | null): LoginOutcome {
    if (data?.status === 'totp_required' && typeof data?.challenge === 'string') {
        return { status: 'totp_required', challenge: data.challenge, msg: data.msg || '' };
    }
    if (ok) {
        return typeof data?.landing === 'string' && data.landing ? { status: 'success', landing: data.landing } : { status: 'success' };
    }
    return { status: 'failed', msg: data?.msg || '', auth_method: data?.auth_method };
}

/** What accepting an invitation answered: the name kept, the @handle made from it, and where to open. */
export interface SignupOutcome {
    ok: boolean;
    msg: string;
    landing?: string;
    handle?: string;
    name?: string;
}

/** What checking an invitation's link found (see validateInvitationToken). */
export interface InvitationCheck {
    valid: boolean;
    /** No answer about the link: the server couldn't be reached, or failed itself. */
    unreachable: boolean;
    email: string;
    name: string;
    inviterName: string;
    workspace: string;
    msg: string;
}

/** The outcome of answering a second-factor challenge. */
type TOTPLoginOutcome =
    | { status: 'success' }
    /**
     * `reason` separates the two failures that need different things from the user. A wrong code means
     * try again in the same screen; an expired challenge means the password step has to be repeated, and
     * telling someone to "check your authenticator app" when the real problem is that they took five
     * minutes is how a person ends up convinced their codes are broken.
     */
    | { status: 'failed'; msg: string; reason: 'code_invalid' | 'challenge_expired' };

class AuthService {
    static async loginWithGoogle() {
        const oauthEndpoint = `${
           process.env.NEXT_PUBLIC_BACKEND_URL
        }oauth_login/google?redirect_uri=${process.env.NEXT_PUBLIC_FRONTEND_URL}app`;

        window.location.href = oauthEndpoint;
    }

    static async loginWithGithub() {
        const oauthEndpoint = `${
            process.env.NEXT_PUBLIC_BACKEND_URL
        }oauth_login/github?redirect_uri=${process.env.NEXT_PUBLIC_FRONTEND_URL}app`;

        window.location.href = oauthEndpoint;
    }

    static async loginAsDemo(): Promise<{ ok: boolean; msg?: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}demo-login`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            if (res.ok) return { ok: true };
            // Surface a useful message when the endpoint isn't wired up
            // (404) or the demo workspace is unavailable. Try to read a
            // body message but don't crash if the response isn't JSON.
            let msg = '';
            try {
                const data = await res.json();
                msg = data?.msg || data?.error || '';
            } catch {
                /* response wasn't JSON */
            }
            if (res.status === 404) {
                msg = msg || 'Demo login is not available on this server.';
            } else if (res.status === 401 || res.status === 403) {
                msg = msg || 'Demo access is currently disabled.';
            } else if (res.status >= 500) {
                msg = msg || 'Demo login is temporarily unavailable. Please try again.';
            }
            return { ok: false, msg };
        } catch (error) {
            console.error('Demo login failed:', error);
            return { ok: false, msg: 'Network error. Please check your connection.' };
        }
    }

    /**
     * Exchanges email and password for either a session or a second-factor challenge.
     *
     * A DISCRIMINATED UNION RATHER THAN `{ ok: boolean }`, and the boolean was the bug. It conflated
     * two different facts — "the request succeeded" and "you are now signed in" — which were the same
     * thing until two-factor authentication existed and are not any more. The server answers a correct
     * password from an enrolled account with HTTP 200 and NO cookies, because the sign-in is not
     * finished. Under the old shape that read as `ok: true`, and the caller routed into the app with no
     * session: every request 401s and the user is bounced back to a login screen that just told them
     * they were logged in.
     *
     * A boolean cannot express three outcomes, so it quietly picked the wrong one. The union can, and it
     * breaks any caller still reading `.ok`.
     *
     * The union alone does NOT force a caller to handle every case, though — TypeScript allows a
     * non-exhaustive switch, so omitting `totp_required` compiles and silently does nothing. Callers
     * close that with assertUnreachable() in the default branch; see app/page.tsx.
     */
    static async loginWithEmail(email: string, password: string): Promise<LoginOutcome> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/login`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                }
            );
            return loginOutcome(res.ok, await res.json());
        } catch (error) {
            console.error('Email login failed:', error);
            return { status: 'failed', msg: 'Network error. Please try again.' };
        }
    }

    /**
     * Completes a two-factor sign-in by exchanging the challenge and a code for cookies.
     *
     * `code` accepts either a six-digit authenticator code or a recovery code — the server tries the
     * authenticator first and falls back, so the UI does not have to ask the user which kind they are
     * holding. One field, two answers.
     */
    static async completeTOTPLogin(challenge: string, code: string): Promise<TOTPLoginOutcome> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/login/totp`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ challenge, code }),
                }
            );
            const data = await res.json();
            if (res.ok) {
                return { status: 'success' };
            }
            // The server's `code` field distinguishes an expired challenge from a wrong digit, which
            // need different things from the user: start over versus try again. Passed through rather
            // than flattened, so the screen can say which.
            return {
                status: 'failed',
                msg: data?.msg || 'That did not work. Please try again.',
                reason: data?.code === 'totp_challenge_invalid' ? 'challenge_expired' : 'code_invalid',
            };
        } catch (error) {
            console.error('Two-factor login failed:', error);
            return { status: 'failed', msg: 'Network error. Please try again.', reason: 'code_invalid' };
        }
    }

    /**
     * Accepts an invitation with a name and a password. The server makes the @handle from the name
     * and answers with it, the name as it was kept, and landing: where the new member opens, the
     * channel they were put in (lib/landing.ts).
     */
    static async signup(token: string, name: string, password: string): Promise<SignupOutcome> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/signup`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, name, password }),
                }
            );
            const data = await res.json();
            const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
            return {
                ok: res.ok,
                msg: data.msg || '',
                landing: text(data.landing),
                handle: text(data.handle),
                name: text(data.name),
            };
        } catch (error) {
            console.error('Signup failed:', error);
            return { ok: false, msg: 'Network error. Please try again.' };
        }
    }

    static async forgotPassword(email: string): Promise<{ ok: boolean; msg: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/forgot-password`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                }
            );
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '' };
        } catch (error) {
            console.error('Forgot password failed:', error);
            return { ok: false, msg: 'Network error. Please try again.' };
        }
    }

    static async resetPassword(token: string, password: string): Promise<{ ok: boolean; msg: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/reset-password`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, password }),
                }
            );
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '' };
        } catch (error) {
            console.error('Reset password failed:', error);
            return { ok: false, msg: 'Network error. Please try again.' };
        }
    }

    /**
     * Whether the workspace still has no admin, and whether the install named
     * who that admin must be.
     *
     * `pinned` is a boolean and never the address: the endpoint answers anyone,
     * and the admin's email is not theirs to have. The setup page uses it only to
     * say "use the address you gave the installer" before the operator finds out
     * from a refusal.
     */
    static async getAdminSetupStatus(): Promise<{ required: boolean; pinned: boolean }> {
        try {
            return await within(async (signal) => {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/admin-setup-required`,
                    { credentials: 'include', signal }
                );
                const data = await res.json();
                return { required: data.required === true, pinned: data.pinned === true };
            });
        } catch {
            return { required: false, pinned: false };
        }
    }

    static async checkAdminSetupRequired(): Promise<boolean> {
        return (await AuthService.getAdminSetupStatus()).required;
    }

    static async adminSetup(email: string, password: string, username: string): Promise<{ ok: boolean; msg: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/admin-setup`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, username }),
                }
            );
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '' };
        } catch (error) {
            console.error('Admin setup failed:', error);
            return { ok: false, msg: 'Network error. Please try again.' };
        }
    }

    /**
     * Checks an invitation's link before the sign-up form shows: the address
     * it is for, a name an import knows them by (`name`, or ""), who invited
     * them and to which workspace (its address), or why the link can't be used.
     *
     * `unreachable` is a check that got no answer about the link: the server
     * couldn't be reached in time, or answered with its own failure (a 5xx, or
     * a proxy's page that isn't the API's). That is not a dead link, and the
     * page says so and offers to check again, rather than "this invitation
     * can't be used" for an invitation that may be fine.
     */
    static async validateInvitationToken(token: string): Promise<InvitationCheck> {
        const text = (v: unknown) => (typeof v === 'string' ? v : '');
        const noAnswer: InvitationCheck = { valid: false, unreachable: true, email: '', name: '', inviterName: '', workspace: '', msg: '' };
        try {
            return await within(async (signal) => {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/validate-token?token=${encodeURIComponent(token)}`,
                    { credentials: 'include', signal }
                );
                if (res.status >= 500) return noAnswer;
                const data = await res.json();
                return {
                    valid: data.valid === true,
                    unreachable: false,
                    email: text(data.email),
                    name: text(data.name),
                    inviterName: text(data.inviter_name),
                    workspace: text(data.workspace),
                    msg: text(data.msg),
                };
            });
        } catch {
            return noAnswer;
        }
    }

    static async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; msg: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/change-password`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: withCsrfHeader({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
                }
            );
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '' };
        } catch (error) {
            console.error('Change password failed:', error);
            return { ok: false, msg: 'Network error. Please try again.' };
        }
    }

        static async hasPassword(): Promise<{ hasPassword: boolean }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/has-password`,
                { credentials: 'include' }
            );
            const data = await res.json();
            return { hasPassword: data.has_password === true };
        } catch {
            return { hasPassword: false };
        }
    }

    /**
     * Probe whether the caller has a live BE session.
     *
     * The auth cookies (Authorization / RefreshToken) are HttpOnly, so the
     * FE cannot detect login state by reading document.cookie — the BE is
     * the only authoritative source. This hits a cheap authenticated
     * endpoint with credentials. If the short-lived access token has
     * expired (401) we attempt a single refresh and re-probe, mirroring the
     * access→refresh handshake the app uses elsewhere.
     *
     * Deliberately uses raw fetch (not the app axiosInstance) so the
     * logged-out path stays inert: axiosInstance's 401 interceptor would
     * fire a refresh→logout cascade (logout POST + localStorage/sessionStorage
     * clear + redirect) which is wasteful and destructive for an anonymous
     * visitor landing on the login page. Returns a plain boolean and never
     * throws.
     */
    static async hasActiveSession(): Promise<boolean> {
        const base = process.env.NEXT_PUBLIC_BACKEND_URL;
        // The whole check, refresh included, within PROBE_TIMEOUT_MS: a probe that
        // never answers is "not signed in", so the sign-in page can draw.
        const check = async (signal: AbortSignal): Promise<boolean> => {
            const probe = async (): Promise<number> => {
                try {
                    const res = await fetch(`${base}user/profile`, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        signal,
                    });
                    return res.status;
                } catch {
                    return 0; // network error → treat as not logged in
                }
            };

            let status = await probe();
            if (status === 401) {
                // Access token likely expired; try one refresh, then re-probe.
                try {
                    const refresh = await fetch(`${base}refreshToken`, {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                        signal,
                    });
                    if (refresh.ok) {
                        status = await probe();
                    }
                } catch {
                    /* refresh unreachable → fall through as not logged in */
                }
            }
            return status >= 200 && status < 300;
        };
        try {
            return await within(check);
        } catch {
            return false; // no answer in time → treat as not logged in
        }
    }

    static async loginWithOIDC() {
        const oauthEndpoint = `${
            process.env.NEXT_PUBLIC_BACKEND_URL
        }oauth_login/oidc?redirect_uri=${process.env.NEXT_PUBLIC_FRONTEND_URL}app`;

        window.location.href = oauthEndpoint;
    }

    static async loginWithSAML() {
        window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}saml/login`;
    }

    /**
     * Exchanges a directory (LDAP) name and password for a session or a second-factor challenge, as
     * loginWithEmail does. The server asks someone with two-step on for the code here too, with a 200,
     * a challenge and no cookie; completeTOTPLogin finishes it, the same as after an email password.
     */
    static async loginWithLDAP(usernameOrEmail: string, password: string): Promise<LoginOutcome> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/ldap-login`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
                }
            );
            return loginOutcome(res.ok, await res.json());
        } catch (error) {
            console.error('LDAP authentication failed:', error);
            return { status: 'failed', msg: 'Directory server unreachable.' };
        }
    }

    /**
     * Fetch the runtime list of enabled auth providers from the backend.
     * Used by the login page so toggling a provider doesn't require a FE redeploy.
     * Falls back to build-time NEXT_PUBLIC_AUTH_* flags on network failure.
     */
    static async getEnabledProviders(): Promise<{
        email: boolean;
        google: boolean;
        github: boolean;
        oidc: boolean;
        saml: boolean;
        ldap: boolean;
        demo: boolean;
    } | null> {
        try {
            return await within(async (signal) => {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/providers`,
                    { credentials: 'include', signal }
                );
                if (!res.ok) return null;
                const data = await res.json();
                const p = data?.providers || {};
                return {
                    email: !!p.email,
                    google: !!p.google,
                    github: !!p.github,
                    oidc: !!p.oidc,
                    saml: !!p.saml,
                    ldap: !!p.ldap,
                    demo: !!p.demo,
                };
            });
        } catch {
            // No answer, or none in time: the page uses the build's own list.
            return null;
        }
    }
}

export default AuthService;