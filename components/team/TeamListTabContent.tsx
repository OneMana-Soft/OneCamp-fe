import { useMemo, useState } from "react";
import { SearchField } from "@/components/search/searchField";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import { TeamListTabProject } from "@/components/team/TeamListTabProject";

export const TeamListTabContent = ({ teamId }: { teamId: string }) => {
    const [inputValue, setInputValue] = useState("")
    const [searchQuery, setSearchQuery] = useState("")

    const debouncedSearch = useMemo(
        () =>
            debounceUtil((searchString: string) => {
                setSearchQuery(searchString.trim())
            }, 500),
        [],
    )

    const handleSearchChange = (q: string) => {
        setInputValue(q)
        debouncedSearch(q)
    }

    return (
        <div className="flex flex-col h-full">
            <SearchField
                onChange={handleSearchChange}
                value={inputValue}
                placeholder={"Search project..."}
            />
            <div className="flex-1 overflow-y-auto">
                <TeamListTabProject searchQuery={searchQuery} teamId={teamId} />
            </div>
        </div>
    )
}
