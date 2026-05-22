"use client"

import { useMemo, useState } from "react"
import { SearchField } from "@/components/search/searchField"
import { ChannelListTabActive } from "@/components/channel/channelListTabActive"
import { ChannelListTabArchive } from "@/components/channel/channelListTabArchive"
import { ChannelListTabAllActive } from "@/components/channel/channelListTabAllActive"
import { debounceUtil } from "@/lib/utils/helpers/debounce"

export const ChannelListTabContent = ({ selectedTab }: { selectedTab: string }) => {
    const [inputValue, setInputValue] = useState("")
    const [searchQuery, setSearchQuery] = useState("")

    const debouncedSearch = useMemo(
        () =>
            debounceUtil((searchString: string) => {
                setSearchQuery(searchString.trim())
            }, 500),
        [],
    )

    const handleChSearchOnChange = (chName: string) => {
        setInputValue(chName)
        debouncedSearch(chName)
    }

    const renderTabs = useMemo(() => {
        switch (selectedTab) {
            case "active":
                return <ChannelListTabActive searchQuery={searchQuery} />
            case "archived":
                return <ChannelListTabArchive searchQuery={searchQuery} />
            case "join":
                return <ChannelListTabAllActive searchQuery={searchQuery} />
            default:
                return null
        }
    }, [searchQuery, selectedTab])

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="border-b border-border/60">
                <SearchField
                    onChange={handleChSearchOnChange}
                    value={inputValue}
                    placeholder="Search channels..."
                />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">{renderTabs}</div>
        </div>
    )
}
