export function getCookie(name: string): string | undefined {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
}

// NOTE: the session cookies (Authorization, RefreshToken, DeviceId) are
// set HttpOnly by the backend, so they are intentionally invisible to
// document.cookie. Do NOT use these helpers to detect login state — a
// read always returns undefined for an HttpOnly cookie regardless of
// whether the user is logged in. To detect a live session, probe an
// authenticated BE endpoint instead (see AuthService.hasActiveSession).
// checkAuthCookieExists is retained only as a best-effort hint for
// non-critical UI (e.g. deciding whether to attempt a theme sync) where
// a false negative is harmless.
export function checkAuthCookieExists(): boolean {
    return !!getCookie("Authorization");

}

export function clearAuthCookies() {
    document.cookie = "Authorization=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "RefreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}