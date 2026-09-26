"use client"

import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
import { endSession } from "@/lib/sessionEnd";
// The store registers its own reset for endSession; importing it makes sure
// that registration has run on every page that can sign out.
import "@/store/store";

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
            // Order matters to prevent cross-user state leakage: first
            // everything kept for this member lets go (Redux and its persisted
            // blob, the response cache, the collaboration token), so nothing
            // writes itself back; only then is storage cleared. Without the
            // first step, localStorage.clear() races the persistor and the
            // response cache, which re-write the previous member's data
            // before the next person signs in.
            await endSession();
            localStorage.clear();
            sessionStorage.clear();
            // Full reload to the login page guarantees a clean slate.
            window.location.href = '/';
        }
    };

    return { logout, isSubmitting };
};
