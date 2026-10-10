"use client"

import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {StatePlaceholder} from "@/components/ui/StatePlaceholder";
import {Lock} from "@/lib/icons";

export default function ChatLayout({
                                      children,
                                  }: Readonly<{
    children: React.ReactNode;
}>) {

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    if (selfProfile.isLoading) {
        return <LoadingStateCircle/>
    }

    if (!selfProfile.data?.data.user_is_admin) {
        // A refusal, not a failure: nothing went wrong, so it is not drawn in
        // the danger colour with an alert icon.
        return (
            <div className="flex h-full items-center justify-center">
                <StatePlaceholder
                    type="empty"
                    icon={Lock}
                    title="Admins only"
                    description="Only workspace admins can open this page. Ask an admin if you need a change made here."
                />
            </div>
        )
    }

    return (
        <>
            {children}

        </>
    )
}