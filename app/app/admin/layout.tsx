"use client"

import {useMedia} from "@/context/MediaQueryContext";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import { Plus } from "@/lib/icons";
import {useDispatch} from "react-redux";
import {ChatUserList} from "@/components/chat/chatUserList";
import {usePathname} from "next/navigation";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {LoadingProvider} from "@/context/LoadingContext";
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
        return <ErrorState errorTitle={"Not authorised"} errorMessage={"only org admin will be access this page"}/>
    }

    return (
        <>
            {children}

        </>
    )
}