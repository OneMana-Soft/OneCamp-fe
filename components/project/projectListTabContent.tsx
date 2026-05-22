import { useMemo, useState } from "react";
import { SearchField } from "@/components/search/searchField";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import { ProjectAttachmentList } from "@/components/project/projectAttachmentList";
import { ProjectTaskList } from "@/components/project/projectTaskList";

/**
 * Tab body for `/app/project/[id]` mobile. One instance per tab so each
 * tab keeps its own scroll position and search state. Selects the
 * appropriate sub-list (Tasks or Attachments) based on `selectedTab`.
 */
export const ProjectListTabContent = ({
    selectedTab,
    projectId,
}: {
    selectedTab: string
    projectId: string
}) => {
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
                placeholder={`Search ${selectedTab}...`}
            />
            <div className="flex-1 overflow-y-auto">
                {selectedTab === "task" && (
                    <ProjectTaskList searchQuery={searchQuery} projectId={projectId} />
                )}
                {selectedTab === "attachment" && (
                    <ProjectAttachmentList searchQuery={searchQuery} projectId={projectId} />
                )}
            </div>
        </div>
    )
}
