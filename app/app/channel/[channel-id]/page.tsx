"use client"

import { useParams } from "next/navigation"
import { ChannelView } from "@/components/views/ChannelView"

export default function Page() {
    const params = useParams()
    return <ChannelView channelId={params?.["channel-id"] as string} />
}
