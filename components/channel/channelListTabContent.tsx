"use client"

import { useMemo, useState } from "react"
import { SearchField } from "@/components/search/searchField"
import { ChannelListTabActive } from "@/components/channel/channelListTabActive"
import { ChannelListTabArchive } from "@/components/channel/channelListTabArchive"
import { ChannelListTabAllActive } from "@/components/channel/channelListTabAllActive"
import { debounceUtil } from "@/lib/utils/helpers/debounce"

export const ChannelListTabContent = ({ selectedTab, onDiscover }: { selectedTab: string; onDiscover?: () => void }) => {
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
                return <ChannelListTabActive searchQuery={searchQuery} onDiscover={onDiscover} />
            case "archived":
                return <ChannelListTabArchive searchQuery={searchQuery} />
            case "join":
                return <ChannelListTabAllActive searchQuery={searchQuery} />
            default:
                return null
        }
    }, [searchQuery, selectedTab, onDiscover])

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="border-b border-border/60">
                {/* Held to the rows' 880px column, so the search and the rows
                    end on one line (the search ran to the panel's edge, 314px
                    past the rows at 1440). */}
                <SearchField
                    onChange={handleChSearchOnChange}
                    value={inputValue}
                    placeholder="Search channels…"
                    className="max-w-[880px]"
                />
            </div>
            {/* A flex column, so each tab's flex-1 list gets the height left
                under the search box. As a plain block it did not, the tab was
                only as tall as its first rows, and the virtual list drew a
                160px window with the rest of the phone screen blank. */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{renderTabs}</div>
        </div>
    )
}
