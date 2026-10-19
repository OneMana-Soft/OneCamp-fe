"use client"

import { memo, useMemo } from "react"
import Link from "next/link"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { readSystemLine, systemLineLink } from "@/lib/conversation/systemLine"
import type { UserProfileInterface } from "@/types/user"

/**
 * A line the server wrote about the conversation ("Maya added Priya"), drawn
 * as a line across the conversation rather than as someone's message: no
 * avatar, no actions, nothing to reply to. Its words are the server's, which
 * named everyone when it wrote them; where it leads (the group it continues
 * in, the one it came from, the channel it became) is a link beside them
 * (lib/conversation/systemLine).
 */
export const SystemLineRow = memo(function SystemLineRow({ html, facts }: { html: string; facts?: string }) {
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    const words = useMemo(() => htmlToPreviewText(html, 400), [html])
    const link = useMemo(() => systemLineLink(readSystemLine(facts), self), [facts, self])
    return (
        <div data-system-line="" className="flex justify-center px-5 py-2">
            <p className="max-w-[640px] text-center text-meta text-ink-2 [overflow-wrap:anywhere]">
                {words}
                {link && (
                    <>
                        {" "}
                        <Link
                            href={link.href}
                            data-interactive="link"
                            data-touch-target=""
                            className="relative rounded-sm font-medium text-brand-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            {link.label}
                        </Link>
                    </>
                )}
            </p>
        </div>
    )
})
