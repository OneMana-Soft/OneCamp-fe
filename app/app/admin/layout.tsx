"use client"

import {useFetchOnlyOnce} from "@/hooks/useFetch";
import { useSaysLoadFailure } from "@/lib/http/loadFailure";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {PermissionLockedNotice} from "@/components/admin/PlanLockedNotice";
import {PageFrame, PageFrameHeader} from "@/components/ui/settingsPage";
import {lastAppRoute} from "@/components/navigationBar/desktop/SettingsNav";
import Link from "next/link";
import {useEffect, useState} from "react";
import {EmptyState} from "@/components/ui/empty-state";
import {Button} from "@/components/ui/button";
import {SpotError} from "@/components/ui/graphics";
import {Skeleton} from "@/components/ui/skeleton";
import {ChevronLeft, RefreshCw, Shield} from "@/lib/icons";
import {SETTINGS_GROUP_HUE} from "@/lib/adminSections";

/**
 * The admin page's frame while the gate asks who you are (design v3, admin
 * §1.2): the section header (a 36px tile, a title and a line) and the first
 * card of rows, at the sizes the page draws them, so the page arrives into its
 * own shape. The settings nav is already in the sidebar.
 */
function AdminFrameSkeleton() {
    return (
        <div role="status" aria-label="Loading Admin" className="flex h-full min-h-0 flex-col bg-background">
            <div className="mx-auto w-full max-w-[944px] px-4 pb-24 pt-6 sm:px-6 sm:pt-10" aria-hidden="true">
                <div className="mb-8 flex items-start gap-4">
                    <Skeleton className="size-9 shrink-0 rounded-[10px] max-sm:hidden" />
                    <div className="flex-1 space-y-2 pt-1">
                        <Skeleton className="h-6 w-36" />
                        <Skeleton className="h-3.5 w-72 max-w-full" />
                    </div>
                </div>
                <div className="set-card">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="set-row flex items-center gap-3">
                            <Skeleton variant="circle" className="size-8 shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className={i % 2 === 0 ? "h-3.5 w-32" : "h-3.5 w-40"} />
                                <Skeleton className="h-3 w-56 max-w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * A refusal, not a failure: nothing went wrong, so it is not drawn in the
 * danger colour with an alert icon. Settings' locked card (QA SH-10): the
 * page's own header, one sentence on --sunken with its lock, and a way on.
 * It was a lone lock and grey text in the middle of an empty sheet.
 */
function AdminOnly() {
    const [back, setBack] = useState("/app")
    useEffect(() => setBack(lastAppRoute()), [])
    return (
        <PageFrame>
            <PageFrameHeader hue={SETTINGS_GROUP_HUE.workspace} icon={Shield} title="Admin" />
            <PermissionLockedNotice
                what="Only workspace admins can open Admin."
                who="Ask an admin if you need a change made here."
            />
            <Button asChild variant="secondary" size="sm" className="mt-4 gap-1.5">
                <Link href={back}>
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Back to app
                </Link>
            </Button>
        </PageFrame>
    )
}

export default function AdminGate({
                                      children,
                                  }: Readonly<{
    children: React.ReactNode;
}>) {

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    // The page says a failed profile read itself, below; the toast stays quiet.
    useSaysLoadFailure(!!selfProfile.isError && !selfProfile.data)

    if (selfProfile.isLoading) {
        return <AdminFrameSkeleton/>
    }

    // Asked before "are you an admin": a failed request leaves no profile, and
    // the page used to answer that with "Admins only", telling an admin they
    // weren't one.
    if (selfProfile.isError && !selfProfile.data) {
        // The whole page, so its heading is the page's, under the error spot.
        return (
            <div className="flex h-full items-center justify-center">
                <EmptyState
                    illustration={<SpotError />}
                    headingLevel={1}
                    title="Couldn't load this page"
                    description="Nothing has been lost. This is usually a connection problem: try again in a moment."
                    action={
                        <Button variant="outline" size="sm" onClick={() => void selfProfile.mutate()} className="gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Try again
                        </Button>
                    }
                />
            </div>
        )
    }

    if (!selfProfile.data?.data.user_is_admin) {
        return <AdminOnly />
    }

    return (
        <>
            {children}

        </>
    )
}
