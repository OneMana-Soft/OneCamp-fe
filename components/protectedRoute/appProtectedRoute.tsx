"use client";

import { Loader2 } from "@/lib/icons";
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {app_login_path} from "@/types/paths";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import { UserProfileResponseSchema } from "@/lib/validations/schemas";
import axios from "axios";
import store, { persistor, RESET_STORE_ACTION } from "@/store/store";

export function AppProtectedRoute({ children }: { children: React.ReactNode }) {

    const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile, UserProfileResponseSchema as any);
    const router = useRouter();
    const dispatch = useDispatch();
    // Guard against double-firing the redirect under StrictMode and against
    // the effect re-running while we wait on the BE logout.
    const handledRef = useRef(false);



    useEffect(() => {
        // Auth failed: server-side logout to clear cookies authoritatively.
        // We can't reliably clear them from JS — the BE sets them with an
        // explicit Domain attribute, so a document.cookie="" clear from a
        // mismatched origin is a silent no-op and the next mount of the
        // login page reads the still-set RefreshToken and bounces straight
        // back to /app/home, producing an infinite loop.
        //
        // Instead: hit the BE logout endpoint (which sends Set-Cookie with
        // an Expires-in-the-past directive that the browser respects), then
        // do a FULL PAGE navigation to /. Full reload so all in-memory
        // state is dropped and the next request to / sees no cookies.
        if (
            (userProfile.isError || (!userProfile.isLoading && !userProfile.data?.data)) &&
            !handledRef.current
        ) {
            handledRef.current = true;

            // Set a one-shot flag so the login page's mount effect doesn't
            // immediately bounce the user back to /app/home if document.cookie
            // still appears to have a RefreshToken (httpOnly-from-domain
            // mismatch, BE logout latency, etc.). The login page reads this
            // flag, breaks the loop for one render, then clears it.
            try {
                sessionStorage.setItem("auth_bounce_guard", "1");
            } catch {
                /* sessionStorage may be unavailable in private mode */
            }

            // Best-effort BE logout. We deliberately use raw axios (not the
            // app's axiosInstance) to avoid the 401 retry / refresh-token
            // dance that interceptors would trigger on a logout call —
            // we're already in the failure path.
            const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}${PostEndpointUrl.Logout.replace(/^\//, "")}`;
            axios
                .post(url, null, { withCredentials: true })
                .catch(() => {})
                .finally(() => {
                    // Reset + purge persisted Redux so the previous user's
                    // state (e.g. the sidebar "Recent" items) can't leak into
                    // the next session — same rationale as useLogout.
                    try {
                        store.dispatch({ type: RESET_STORE_ACTION });
                        void persistor.purge();
                    } catch {
                        /* ignore */
                    }
                    localStorage.clear();
                    sessionStorage.clear();
                    // Full-page nav. router.replace inside SPA wouldn't drop
                    // in-memory React state and the new mount-effect on /
                    // could read a stale Redux-persist value mid-rehydrate.
                    window.location.href = app_login_path;
                });
            return;
        }


        if(userProfile.data?.data) {
            // The reducer ignores empty/undefined emoji-status payloads
            // (profile-fetch responses omit the field when no active
            // status exists, and we don't want that absence to clobber
            // a value just delivered by MQTT). Pass the raw value
            // through and let the reducer make the decision.
            dispatch(updateUserEmojiStatus({userUUID: userProfile.data?.data.user_uuid, status: userProfile.data?.data.user_emoji_statuses?.[0] as UserEmojiStatus}));
            dispatch(updateUserStatus({userUUID: userProfile.data?.data.user_uuid, status:userProfile.data.data.user_status || 'online'}));
            dispatch(updateUserConnectedDeviceCount({userUUID: userProfile.data?.data.user_uuid, deviceConnected:userProfile.data?.data.user_device_connected || 0}));

        }

    }, [userProfile.isError, userProfile.isLoading, userProfile.data?.data, router, dispatch]);

    if (userProfile.isLoading) {
        return (
            <div className='flex justify-center items-center h-[100vh] space-x-3'>
                <Loader2 className="size-10 animate-spin" />
            </div>
        );
    }

    if (!userProfile.isLoading && userProfile.data?.data) {
        return children;
    }

    return null;


    // return children


}