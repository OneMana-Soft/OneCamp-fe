"use client"

import { useCallback, useEffect, useState } from "react"
import { Hash, Plus } from "@/lib/icons"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDispatch } from "react-redux"
import { ChannelListTabContent } from "@/components/channel/channelListTabContent"
import { SectionTabs } from "@/components/ui/sectionTabs"
import { Button } from "@/components/ui/button"
import { openUI } from "@/store/slice/uiSlice"

const VALID_TABS = ["active", "archived", "join"] as const
type TabValue = (typeof VALID_TABS)[number]

const TABS = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "join", label: "Discover" },
] as const

export function ChannelListTabs() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const dispatch = useDispatch()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue)
            ? (tabFromUrl as TabValue)
            : "active"
    })

    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    useEffect(() => {
        if (pathname === "/app/channel" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [selectedTab, pathname, router, searchParams])

    return (
        <SectionTabs
            tabs={[...TABS]}
            value={selectedTab}
            onValueChange={handleTabChange}
            icon={Hash}
            title="Channels"
            actions={
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="New channel"
                    onClick={() => dispatch(openUI({ key: "createChannel" }))}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            }
        >
            <ChannelListTabContent selectedTab={selectedTab} />
        </SectionTabs>
    )
}
