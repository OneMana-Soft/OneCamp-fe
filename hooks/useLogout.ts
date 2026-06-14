"use client"

import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
import store, { persistor, RESET_STORE_ACTION } from "@/store/store";

export const useLogout = () => {
    const { makeRequest, isSubmitting } = usePost();

    const logout = async () => {
        try {
            await makeRequest({
                apiEndpoint: PostEndpointUrl.Logout,
                showToast: false, // We'll handle redirection which is feedback enough
            });
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            // Order matters to prevent cross-user state leakage:
            // 1. Reset all Redux slices to their initial state (in-memory).
            // 2. Purge the redux-persist store so the persisted blob (e.g. the
            //    "recentItems" slice that backs the sidebar "Recent" section)
            //    is removed AND the persistor stops auto-flushing the old
            //    in-memory state back to storage.
            // 3. Clear local/session storage for anything outside redux-persist.
            // Without (1)+(2), localStorage.clear() alone races the persistor,
            // which re-writes the previous user's Recent items before the next
            // user logs in.
            try {
                store.dispatch({ type: RESET_STORE_ACTION });
                await persistor.purge();
                await persistor.flush();
            } catch (e) {
                console.error("Failed to purge persisted store on logout:", e);
            }
            localStorage.clear();
            sessionStorage.clear();
            // Full reload to the login page guarantees a clean slate.
            window.location.href = '/';
        }
    };

    return { logout, isSubmitting };
};
