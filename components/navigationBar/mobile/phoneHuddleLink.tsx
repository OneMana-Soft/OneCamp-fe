"use client"

import Link from "next/link"
import { Headphones } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The huddle on the phone's conversation bar (C06 phone variant): a moss
 * circle in a 44px target. Live, the circle is solid moss with the live dot's
 * ring; otherwise the moss tint with the headphones. Its own chunk: the bar
 * sits in the app layout, so only a conversation's bar fetches it. It only
 * presents: PhoneHuddleButton decides whether there is a huddle to offer.
 */
export function PhoneHuddleLink({ href, live }: { href: string; live: boolean }) {
    return (
        <Link
            href={href}
            aria-label={live ? "Join the huddle in progress" : "Start a huddle"}
            data-phone-huddle={live ? "live" : ""}
            data-press="icon"
            className="grid size-11 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
            <span
                className={cn(
                    "relative grid size-8 place-items-center rounded-full [&_svg]:size-4",
                    live ? "bg-camp-moss text-white" : "bg-camp-moss-tint text-camp-moss-ink",
                )}
            >
                {live ? <span aria-hidden="true" className="absolute inset-0 rounded-full bg-camp-moss motion-safe:animate-live-halo" /> : null}
                <Headphones aria-hidden="true" className="relative" />
            </span>
        </Link>
    )
}
