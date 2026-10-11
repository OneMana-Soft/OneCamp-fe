import { useState } from "react";
import { DocListTabPrivate } from "@/components/doc/docListTabPrivate";
import { DocListTabPublic } from "@/components/doc/docListTabPublic";
import { cn } from "@/lib/utils/helpers/cn";

export const DocListTabContent = ({ selectedTab, searchQuery, onClearSearch }: { selectedTab: string; searchQuery: string; onClearSearch?: () => void }) => {
    // A tab, once opened, stays mounted (hidden while another shows), so
    // switching back shows its cards where they were instead of remounting it:
    // that flashed the skeleton and put the list back on page 1 at the top.
    // A tab not yet opened isn't mounted, so it asks for nothing.
    const [seen, setSeen] = useState<Set<string>>(() => new Set([selectedTab]))
    if (!seen.has(selectedTab)) setSeen(new Set(seen).add(selectedTab))

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {seen.has("private") && (
                <div className={cn("flex-1 min-h-0 overflow-hidden flex-col", selectedTab === "private" ? "flex" : "hidden")} data-doc-tab="private">
                    <DocListTabPrivate searchQuery={searchQuery} onClearSearch={onClearSearch} />
                </div>
            )}
            {seen.has("public") && (
                <div className={cn("flex-1 min-h-0 overflow-hidden flex-col", selectedTab === "public" ? "flex" : "hidden")} data-doc-tab="public">
                    <DocListTabPublic searchQuery={searchQuery} onClearSearch={onClearSearch} />
                </div>
            )}
        </div>
    );
}
