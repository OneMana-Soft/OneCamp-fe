export function getCookie(name: string): string | undefined {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export function checkAuthCookieExists(): boolean {
    return !!getCookie("Authorization");

}

export function checkRefreshCookieExists(): boolean {
    return !!getCookie("RefreshToken");
}

export function clearAuthCookies() {
    document.cookie = "Authorization=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "RefreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}