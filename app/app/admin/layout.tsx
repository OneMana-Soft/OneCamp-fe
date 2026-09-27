"use client"

import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {ErrorState} from "@/components/error/errorState";

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
        return <ErrorState errorTitle={"Admins only"} errorMessage={"Only workspace admins can open this page. Ask an admin if you need a change made here."}/>
    }

    return (
        <>
            {children}

        </>
    )
}