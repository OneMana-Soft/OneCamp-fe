import { useMemo, useState } from "react";
import { SearchField } from "@/components/search/searchField";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import { ProjectList } from "@/components/project/ProjectList";

/**
 * Mobile "all projects" surface (`/app/project`). Shows the user's
 * projects across all teams. Search is debounced 500ms; the list
 * itself uses the standard ListRow pattern via `TeamProjectInfoMobile`.
 */
export const ProjectListContent = () => {
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
                <ProjectList searchQuery={searchQuery} />
            </div>
        </div>
    )
}
