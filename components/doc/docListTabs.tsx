"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus } from "@/lib/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { DocListTabContent } from "@/components/doc/docListTabContent";
import { SectionTabs } from "@/components/ui/sectionTabs";
import { Button } from "@/components/ui/button";
import { openUI } from "@/store/slice/uiSlice";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { DocInfoListInterfaceResp } from "@/types/doc";
import { defaultDocTab, isDocTab, type DocTab } from "@/lib/utils/docTab";

type TabValue = DocTab

const TABS = [
    { value: "private", label: "Private" },
    { value: "public", label: "Public" },
] as const

export function DocListTabs() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const dispatch = useDispatch()

    // The tab the URL asked for, read once: a tab chosen later by the viewer
    // is written back to the URL and must not be second-guessed.
    const [urlTab] = useState(() => searchParams.get("tab"))
    const [selectedTab, setSelectedTab] = useState<TabValue>(() => defaultDocTab(urlTab, undefined))
    const [chosen, setChosen] = useState(isDocTab(urlTab))

    // The same first page the Private list asks for, so SWR serves both from
    // one request. Only asked when no tab was named.
    const { data: firstPrivate } = useFetch<DocInfoListInterfaceResp>(
        chosen ? "" : `${GetEndpointUrl.GetUserPrivateDocList}?pageIndex=0&pageSize=20`
    )
    useEffect(() => {
        if (chosen || !firstPrivate) return
        setSelectedTab(defaultDocTab(null, (firstPrivate.data?.docs ?? []).length))
        setChosen(true)
    }, [chosen, firstPrivate])

    const handleTabChange = useCallback((value: string) => {
        if (isDocTab(value)) {
            setChosen(true)
            setSelectedTab(value)
        }
    }, [])

    useEffect(() => {
        // Not before the default is settled, or "private" would be written
        // first and read back later as a choice.
        if (!chosen) return
        if (pathname === "/app/doc" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [chosen, selectedTab, pathname, router, searchParams])

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
