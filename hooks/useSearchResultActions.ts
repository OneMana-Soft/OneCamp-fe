"use client"

import { useCallback } from "react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useDispatch } from "react-redux"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { openUI } from "@/store/slice/uiSlice"
import type { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { resultPath } from "@/lib/search/resultPath"
import { getAttachmentLightboxData } from "@/lib/utils/helpers/search"
import type { SearchResult } from "@/services/searchService"

/**
 * What opening a search hit does, wherever the hit is listed (the palette and
 * the search page): one mapping for where a hit opens (resultPath), a person
 * opens their card, and a file previews in the lightbox. done runs first, as
 * the palette closes itself.
 */
export function useSearchResultActions(done?: () => void) {
    const router = useAppRouter()
    const dispatch = useDispatch()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfUUID = selfProfile.data?.data.user_uuid || ""

    const handleResultClick = useCallback((result: SearchResult) => {
        done?.()
        if (result.type === "user") {
            dispatch(openUI({ key: 'otherUserProfile', data: { userUUID: result.user?.user_id } }))
            return
        }
        const path = resultPath(result, selfUUID)
        if (path) router.push(path)
    }, [done, router, dispatch, selfUUID])

    const handlePreview = useCallback((result: SearchResult) => {
        const lightboxData = getAttachmentLightboxData(result, selfUUID)
        if (lightboxData) {
            dispatch(openUI({ key: 'attachmentLightbox', data: lightboxData }))
        }
    }, [dispatch, selfUUID])

    return { handleResultClick, handlePreview }
}
