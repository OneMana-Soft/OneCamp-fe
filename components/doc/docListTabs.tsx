"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus } from "@/lib/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { DocListTabContent } from "@/components/doc/docListTabContent";
import { SectionTabs } from "@/components/ui/sectionTabs";
import { Button } from "@/components/ui/button";
import { openUI } from "@/store/slice/uiSlice";

const VALID_TABS = ["private", "public"] as const
type TabValue = (typeof VALID_TABS)[number]

const TABS = [
    { value: "private", label: "Private" },
    { value: "public", label: "Public" },
] as const

export function DocListTabs() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const dispatch = useDispatch()

    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "private"
    })

    const handleTabChange = useCallback((value: string) => {
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

    return (
        <SectionTabs
            tabs={[...TABS]}
            value={selectedTab}
            onValueChange={handleTabChange}
            icon={FileText}
            title="Docs"
            actions={
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="New doc"
                    onClick={() => dispatch(openUI({ key: "createDoc" }))}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            }
        >
            <DocListTabContent selectedTab={selectedTab} />
        </SectionTabs>
    )
}
