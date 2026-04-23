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

    static async loginAsDemo(): Promise<boolean> {
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
            return res.ok;
        } catch (error) {
            console.error('Demo login failed:', error);
            return false;
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
                    headers: { 'Content-Type': 'application/json' },
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

}

export default AuthService;