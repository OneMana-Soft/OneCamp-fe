"use client"

import { Star } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { ChannelInfoInterfaceResp } from "@/types/channel"
import { useEffect, useState } from "react"
import { usePost } from "@/hooks/usePost"
import { useDispatch } from "react-redux"
import { toggleUserChannelFavorite } from "@/store/slice/userSlice"
import { cn } from "@/lib/utils/helpers/cn"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"

export function MobileTopNavigationBarSecondChannel({ channelUUID }: { channelUUID: string }) {
    const dispatch = useDispatch()
    const [isFavorite, setFavorite] = useState<boolean>(false)
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(
        `${GetEndpointUrl.ChannelBasicInfo}/${channelUUID}`,
    )
    const postFav = usePost()

    useEffect(() => {
        setFavorite(channelInfo.data?.channel_info.ch_is_user_fav || false)
    }, [channelInfo.data?.channel_info.ch_is_user_fav])

    if (!channelInfo.data && !channelInfo.isLoading) return null

    const toggleFavourite = async () => {
        const nextState = !isFavorite
        setFavorite(nextState)
        dispatch(toggleUserChannelFavorite({ channelUUID, isFavorite: nextState }))

        try {
            if (isFavorite) {
                await postFav.makeRequest({
                    apiEndpoint: PostEndpointUrl.RemoveFavChannel,
                    appendToUrl: `/${channelUUID}`,
                })
            } else {
                await postFav.makeRequest({
                    apiEndpoint: PostEndpointUrl.AddFavChannel,
                    appendToUrl: `/${channelUUID}`,
                })
            }
        } catch {
            setFavorite(!nextState)
            dispatch(toggleUserChannelFavorite({ channelUUID, isFavorite: !nextState }))
        }
    }

    return (
        <div className="flex justify-center items-center gap-2 min-w-0 px-2">
            {/* The channel's colour, as in the channel list and on desktop. */}
            <IdentityMark id={channelUUID} variant="dot" size={8} />
            <span className="text-base font-semibold text-foreground truncate">
                {channelInfo.data?.channel_info.ch_name}
            </span>
            <button
                type="button"
                onClick={toggleFavourite}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                // Drawn 28px beside the name, touched as 44: the box around it
                // reaches 8px further on every side without moving the title.
                className="relative shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors after:absolute after:-inset-2 after:content-['']"
            >
                <Star
                    className={cn(
                        "h-4 w-4",
                        isFavorite && "text-warning-ink fill-warning",
                    )}
                />
            </button>
        </div>
    )
}
