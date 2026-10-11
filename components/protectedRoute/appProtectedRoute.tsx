"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {app_login_path} from "@/types/paths";
import { takePendingConnect } from "@/lib/pendingConnect";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useDispatch} from "react-redux";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import { UserProfileResponseSchema } from "@/lib/validations/schemas";
import axios from "axios";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { SpotCrash } from "@/components/error/shellSpots";
import { SplashFrame, SplashRing, serverHost, workspaceName } from "@/components/protectedRoute/Splash";
import { SkeletonShell } from "@/components/protectedRoute/SkeletonShell";
import { endSession, onSessionEndedElsewhere } from "@/lib/sessionEnd";
// The store registers its own reset for endSession; importing it makes sure
// that registration has run.
import "@/store/store";

/**
 * Whether the profile request failed because the session is gone: the server
 * answered 401 or 403, after the axios interceptor's refresh (which signs out
 * itself, lib/axiosInstance). Any other failure, such as the network dropping,
 * a server error or a reply the app can't read, says nothing about the session.
 */
export function sessionGone(error: unknown): boolean {
    const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
    return status === 401 || status === 403;
}

export function AppProtectedRoute({ children }: { children: React.ReactNode }) {

    // Asked for on every mount, and the app waits for the answer: it says
    // whose session this is, and the response cache lets in what it kept only
    // when that's the member it kept it for (lib/swrCache).
    const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile, UserProfileResponseSchema as any, { revalidateOnMount: true });
    const router = useRouter();
    const dispatch = useDispatch();
    // Guard against double-firing the redirect under StrictMode and against
    // the effect re-running while we wait on the BE logout.
    const handledRef = useRef(false);
    // Whether the splash (or the skeleton shell) was on screen, so the shell
    // fades in after it and only after it.
    const splashShown = useRef(false);
    if (!userProfile.data?.data) splashShown.current = true;
    const [reopening] = useState(openedBefore);
    const [slow, setSlow] = useState(false);
    const waiting = !userProfile.data?.data && !userProfile.isError;
    useEffect(() => {
        if (!waiting) {
            setSlow(false);
            return;
        }
        const t = setTimeout(() => setSlow(true), SPLASH_SLOW_MS);
        return () => clearTimeout(t);
    }, [waiting]);

    // Signed out in another tab: that tab has told this one, which has let go
    // of the member's things (lib/sessionEnd). A full load of the login page
    // drops what's still on screen and the realtime connection.
    useEffect(() => onSessionEndedElsewhere(() => window.location.replace(app_login_path)), []);


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
        //
        // Only when the session is really gone: the server said so, or answered
        // without a user. Any other failure signed people out too, so a network
        // blip or a server error sent everyone, demo visitors included, back to
        // the login page; now the page offers to try again instead.
        const answeredWithoutUser =
            !userProfile.isLoading && !userProfile.isError && userProfile.data !== undefined && !userProfile.data?.data;
        if (
            (sessionGone(userProfile.isError) || answeredWithoutUser) &&
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
                .finally(async () => {
                    // Let go of everything kept for the member (Redux and its
                    // persisted blob, the response cache, the collaboration
                    // token) and tell the other tabs, before storage is
                    // cleared — same rationale as useLogout.
                    await endSession();
                    localStorage.clear();
                    sessionStorage.clear();
                    // Full-page nav. router.replace inside SPA wouldn't drop
                    // in-memory React state and the new mount-effect on /
                    // could read a stale Redux-persist value mid-rehydrate.
                    window.location.href = app_login_path;
                });
            return;
        }


        // Nothing asked for yet, and nothing on its way: ask. (SWR doesn't
        // start this request by itself in every case, and nothing else would.)
        if (!userProfile.data && !userProfile.isError && !userProfile.isLoading && !userProfile.isValidating) {
            void userProfile.mutate();
            return;
        }

        if(userProfile.data?.data) {
            try {
                sessionStorage.setItem(OPENED_KEY, "1");
            } catch {
                /* private mode: the splash shows each time, which is fine */
            }
            // The reducer ignores empty/undefined emoji-status payloads
            // (profile-fetch responses omit the field when no active
            // status exists, and we don't want that absence to clobber
            // a value just delivered by MQTT). Pass the raw value
            // through and let the reducer make the decision.
            dispatch(updateUserEmojiStatus({userUUID: userProfile.data?.data.user_uuid, status: userProfile.data?.data.user_emoji_statuses?.[0] as UserEmojiStatus}));
            dispatch(updateUserStatus({userUUID: userProfile.data?.data.user_uuid, status:userProfile.data.data.user_status || 'online'}));
            dispatch(updateUserConnectedDeviceCount({userUUID: userProfile.data?.data.user_uuid, deviceConnected:userProfile.data?.data.user_device_connected || 0}));

            // An outside agent's sign-in that was waiting for this login (see
            // lib/pendingConnect). Every login method lands here, so this is
            // the one place that can take the person back to approve it.
            const resume = takePendingConnect();
            if (resume) router.replace(resume);
        }

    }, [userProfile.isError, userProfile.isLoading, userProfile.isValidating, userProfile.data, userProfile.mutate, router, dispatch]);

    if (userProfile.data?.data) {
        // After the splash, the shell fades up once (160ms, opacity). Straight
        // from the cache it simply appears.
        return splashShown.current ? <div className="shell-enter">{children}</div> : children;
    }

    // The profile couldn't be read, but the session is fine: say so, and try
    // again (SWR also retries on its own). On the splash's frame, so the
    // moment does not jump to a white page.
    if (userProfile.isError && !sessionGone(userProfile.isError)) {
        return (
            <SplashFrame data-splash-error="">
                <div className="flex flex-col items-center">
                    <SpotCrash />
                    <ErrorState subject="your workspace" onRetry={() => void userProfile.mutate()} retrying={userProfile.isValidating} className="py-4 [&_[data-empty-icon]]:hidden" />
                </div>
            </SplashFrame>
        );
    }

    return <AppSplash slow={slow} onRetry={() => void userProfile.mutate()} reopening={reopening} />;
}

/** Whether this tab has opened the app before: then a reload shows the skeleton shell, not the splash. */
const OPENED_KEY = "onecamp:opened";
function openedBefore(): boolean {
    try {
        return sessionStorage.getItem(OPENED_KEY) === "1";
    } catch {
        return false;
    }
}

/** How long the splash waits before it says it is still connecting. */
export const SPLASH_SLOW_MS = 8000;

/**
 * The app opening (design v3, shell §L1). Never a centred spinner: the frame,
 * then from 150ms the glow and the ring drawn once with "Opening <workspace>";
 * past 8s it says it is still connecting, with a way to try again. A tab that
 * has opened the app before shows the skeleton shell instead.
 */
export function AppSplash({ slow, onRetry, reopening }: { slow: boolean; onRetry: () => void; reopening: boolean }) {
    if (reopening && !slow) return <SkeletonShell />;
    return (
        <SplashFrame role="status" aria-live="polite">
            <SplashRing />
            {slow ? (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-ink-3">Still connecting to {serverHost()}…</p>
                    <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button>
                </div>
            ) : (
                <p className="splash-line text-xs text-ink-3">Opening {workspaceName()}</p>
            )}
        </SplashFrame>
    );
}
