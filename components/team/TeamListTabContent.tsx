import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { SearchField } from "@/components/search/searchField";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import { TeamListTabProject } from "@/components/team/TeamListTabProject";
import { SectionTabs, SectionTabsContent } from "@/components/ui/sectionTabs";
import { DocTreeSkeleton } from "@/components/docTree/DocsSection";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { TeamInfoRawInterface } from "@/types/team";

// The team's docs (docs programme B5): the pages made in its space, loaded
// when the tab is first shown.
const SpaceDocs = dynamic(() => import("@/components/docTree/SpaceDocs"), { loading: () => <DocTreeSkeleton rows={4} /> });

export const TeamListTabContent = ({ teamId }: { teamId: string }) => {
    const [tab, setTab] = useState<"projects" | "docs">("projects")
    const [inputValue, setInputValue] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const teamInfo = useFetch<TeamInfoRawInterface>(teamId ? `${GetEndpointUrl.GetTeamInfo}/${teamId}` : "")

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
        <SectionTabs
            tabs={[
                { value: "projects", label: "Projects" },
                { value: "docs", label: "Docs" },
            ]}
            value={tab}
            onValueChange={(v) => setTab(v as "projects" | "docs")}
            className="flex h-full min-h-0 flex-col"
        >
            <SectionTabsContent value="projects" className="flex min-h-0 flex-1 flex-col outline-none">
                <SearchField
                    onChange={handleSearchChange}
                    value={inputValue}
                    placeholder={"Search project…"}
                />
                <div className="flex-1 overflow-y-auto">
                    <TeamListTabProject searchQuery={searchQuery} teamId={teamId} />
                </div>
            </SectionTabsContent>
            <SectionTabsContent value="docs" className="min-h-0 flex-1 overflow-y-auto outline-none">
                <SpaceDocs space={`team:${teamId}` as const} name={teamInfo.data?.data.team_name} />
            </SectionTabsContent>
        </SectionTabs>
    )
}
