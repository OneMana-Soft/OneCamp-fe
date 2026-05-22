"use client";

import { FileText } from "@/lib/icons";
import {useCallback, useEffect, useState} from "react";
import {useMedia} from "@/context/MediaQueryContext";
import {DocListTabContent} from "@/components/doc/docListTabContent";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import { cn } from "@/lib/utils/helpers/cn";

const VALID_TABS = ["private", "public"] as const
type TabValue = (typeof VALID_TABS)[number]

export function DocListTabs() {

    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "private"
    })

    const handleChangeTab = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            setSelectedTab(value as TabValue)
        }
    }, [])

    useEffect(() => {
        if (pathname === "/app/doc" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [selectedTab, pathname, router, searchParams])

    const {isDesktop} = useMedia()

    return (
        <div className="flex flex-col h-full">
            <div className="border-b">
                <div
                    role="tablist"
                    aria-label="Document visibility tabs"
                    className="h-10 md:h-16 text-sm flex w-full md:w-[40vw] md:justify-start justify-around items-center p-1.5 space-x-3 md:p-4 md:ml-2"
                >
                    {isDesktop && (
                        <div className="flex space-x-2 justify-center items-center mr-6">
                            <div className="bg-muted flex justify-center items-center rounded-md w-8 p-1">
                                <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div className="text-base">Docs</div>
                        </div>
                    )}

                    {VALID_TABS.map((tab) => (
                        <button
                            key={tab}
                            role="tab"
                            aria-selected={selectedTab === tab}
                            onClick={() => handleChangeTab(tab)}
                            className={cn(
                                "md:h-8 flex justify-center items-center md:w-fit md:px-8 h-full w-full text-center rounded-md transition-all duration-150 hover:bg-muted/50",
                                selectedTab === tab
                                    ? "bg-primary font-medium text-primary-foreground shadow-sm"
                                    : "text-muted-foreground"
                            )}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <DocListTabContent selectedTab={selectedTab} />
        </div>
    )
}
