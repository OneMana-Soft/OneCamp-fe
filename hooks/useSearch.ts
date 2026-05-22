"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch"
import { useDebounce } from "@/hooks/useDebounce"
import { GlobalSearchGet, SearchResult } from "@/services/searchService"
import { openUI } from "@/store/slice/uiSlice"
import type {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {getOtherUserId} from "@/lib/utils/getOtherUserId";
import { getAttachmentLightboxData } from "@/lib/utils/helpers/search";

interface UseSearchProps {
    initialQuery?: string;
    debounceMs?: number;
    syncWithUrl?: boolean;
}

export const useSearch = ({ 
    initialQuery = "", 
    debounceMs = 300,
    syncWithUrl = false 
}: UseSearchProps = {}) => {
    const [inputValue, setInputValue] = useState(initialQuery)
    const debouncedValue = useDebounce(inputValue, debounceMs)
    const [open, setOpen] = useState(false)
    const router = useRouter()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const dispatch = useDispatch()

    const { data: searchData, isLoading } = useFetch<any>(
        debouncedValue && debouncedValue.length >= 2
            ? GlobalSearchGet(debouncedValue)
            : ""
    )

    const results: SearchResult[] = searchData?.data?.page || []
    const isSearching = isLoading && debouncedValue.length >= 2

    useEffect(() => {
        if (inputValue && debouncedValue) {
            setOpen(true)
        } else if (!inputValue) {
            setOpen(false)
        }
    }, [inputValue, debouncedValue])

    const handleClear = useCallback(() => {
        setInputValue("")
        setOpen(false)
    }, [])

    const handleSearchSubmit = useCallback((query?: string) => {
        const searchQuery = query || inputValue
        if (searchQuery.trim().length >= 2) {
            setOpen(false)
            router.push(`/app/search?query=${encodeURIComponent(searchQuery.trim())}`)
        }
    }, [inputValue, router])

    const handleResultClick = useCallback((result: SearchResult) => {
        setOpen(false)
        setInputValue("")
        
        switch (result.type) {
            case "chat":
                router.push(`/app/chat/${result.chat?.chat_id}`)
                break
            case "post":
                if (result.post?.post_ch_id) {
                    router.push(`/app/channel/${result.post.post_ch_id}/${result.post.post_id}`)
                } else if (result.post?.post_channel_id) {
                    router.push(`/app/channel/${result.post.post_channel_id}/${result.post.post_id}`)
                } else {
                    router.push(`/app/posts`)
                }
                break
            case "doc":
                router.push(`/app/doc/${result.doc?.doc_uuid}`)
                break
            case "task":
                router.push(`/app/task/${result.task?.task_id}`)
                break
            case "comment":
                if (result.comment?.comment_doc_id) {
                    router.push(`/app/doc/${result.comment.comment_doc_id}/comment`)
                } else if (result.comment?.comment_chat_grp_id) {
                    if(result.comment?.comment_chat_grp_id.includes(" ")) {
                        const otherUUID = getOtherUserId(result.comment?.comment_chat_grp_id, selfProfile.data?.data.user_uuid || '')
                        router.push(`/app/chat/${otherUUID}/${result.comment.comment_chat_id}`)
                    }
                    if(!result.comment?.comment_chat_grp_id.includes(" ")) {
                        router.push(`/app/chat/group/${result.comment.comment_chat_grp_id}/${result.comment.comment_chat_id}`)
                    }
                } else if (result.comment?.comment_task_id) {
                    router.push(`/app/task/${result.comment.comment_task_id}`)
                } else if (result.comment?.comment_post_id) {
                    router.push(`/app/channel/${result.comment.comment_channel_id}/${result.comment.comment_post_id}`)
                }
                break
            case "attachment":
                if (result.attachment?.attachment_doc_id) {
                    router.push(`/app/doc/${result.attachment.attachment_doc_id}/comment`)
                } else if (result.attachment?.attachment_chat_grp_id) {
                    if(result.attachment?.attachment_chat_grp_id.includes(" ")) {
                        const otherUUID = getOtherUserId(result.attachment?.attachment_chat_grp_id, selfProfile.data?.data.user_uuid || '')
                        router.push(`/app/chat/${otherUUID}/${result.attachment.attachment_chat_id}`)
                    }
                    if(!result.attachment?.attachment_chat_grp_id.includes(" ")) {
                        router.push(`/app/chat/group/${result.attachment.attachment_chat_grp_id}/${result.attachment.attachment_chat_id}`)
                    }
                } else if (result.attachment?.attachment_task_id) {
                    router.push(`/app/task/${result.attachment.attachment_task_id}`)
                } else if (result.attachment?.attachment_post_id) {
                    router.push(`/app/channel/${result.attachment.attachment_channel_id}/${result.attachment.attachment_post_id}`)
                }
                break
            case "user":
                dispatch(openUI({ key: 'otherUserProfile', data: { userUUID: result.user?.user_id } }))
                break
            case "project":
                router.push(`/app/project/${result.project?.project_id}`)
                break
            case "team":
                router.push(`/app/team/${result.team?.team_id}`)
                break
            case "channel":
                router.push(`/app/channel/${result.channel?.ch_id}`)
                break
        }
    }, [router, dispatch, selfProfile.data?.data.user_uuid])

    const handlePreview = useCallback((result: SearchResult) => {
        const lightboxData = getAttachmentLightboxData(result, selfProfile.data?.data.user_uuid || "")
        if (lightboxData) {
            dispatch(openUI({
                key: 'attachmentLightbox',
                data: lightboxData
            }))
        }
    }, [dispatch, selfProfile.data?.data.user_uuid])

    return {
        inputValue,
        setInputValue,
        debouncedValue,
        results,
        isLoading: isSearching,
        open,
        setOpen,
        handleClear,
        handleResultClick,
        handlePreview,
        handleSearchSubmit
    }
}
