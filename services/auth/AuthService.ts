import { withCsrfHeader } from "@/lib/utils/csrf";

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

    static async loginWithEmail(email: string, password: string): Promise<{ ok: boolean; msg: string; auth_method?: string }> {
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
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '', auth_method: data.auth_method };
        } catch (error) {
            console.error('Email login failed:', error);
            return { ok: false, msg: 'Network error. Please try again.' };
        }
    }

    static async signup(token: string, username: string, password: string): Promise<{ ok: boolean; msg: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/signup`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, username, password }),
                }
            );
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '' };
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

    static async checkAdminSetupRequired(): Promise<boolean> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/admin-setup-required`,
                { credentials: 'include' }
            );
            const data = await res.json();
            return data.required === true;
        } catch {
            return false;
        }
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

    static async validateInvitationToken(token: string): Promise<{ valid: boolean; email: string; msg: string }> {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/validate-token?token=${encodeURIComponent(token)}`,
                { credentials: 'include' }
            );
            const data = await res.json();
            return { valid: data.valid === true, email: data.email || '', msg: data.msg || '' };
        } catch {
            return { valid: false, email: '', msg: 'Network error' };
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
        const probe = async (): Promise<number> => {
            try {
                const res = await fetch(`${base}user/profile`, {
                    method: 'GET',
                    credentials: 'include',
                    // Don't let a never-resolving network hang the loading
                    // screen; treat a slow/failed probe as "not logged in".
                    cache: 'no-store',
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
                });
                if (refresh.ok) {
                    status = await probe();
                }
            } catch {
                /* refresh unreachable → fall through as not logged in */
            }
        }
        return status >= 200 && status < 300;
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

    static async loginWithLDAP(usernameOrEmail: string, password: string): Promise<{ ok: boolean; msg: string }> {
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
            const data = await res.json();
            return { ok: res.ok, msg: data.msg || '' };
        } catch (error) {
            console.error('LDAP authentication failed:', error);
            return { ok: false, msg: 'Directory server unreachable.' };
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
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}auth/providers`,
                { credentials: 'include' }
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
        } catch {
            return null;
        }
    }
}

export default AuthService;