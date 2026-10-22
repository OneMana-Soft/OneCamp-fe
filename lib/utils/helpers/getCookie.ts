export function getCookie(name: string): string | undefined {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
}

// NOTE: the session's cookies are HttpOnly and on the API's own host, so
// document.cookie never shows them. Never read sign-in state here: the app
// knows it from the profile it holds (AppProtectedRoute), and the sign-in
// page asks the API (AuthService.hasActiveSession).