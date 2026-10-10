import {useCallback, useMemo, useState} from "react";
import {SearchField} from "@/components/search/searchField";
import {debounceUtil} from "@/lib/utils/helpers/debounce";
import {DocListTabPrivate} from "@/components/doc/docListTabPrivate";
import {DocListTabPublic} from "@/components/doc/docListTabPublic";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {cn} from "@/lib/utils/helpers/cn";


export const DocListTabContent = ({selectedTab}: {selectedTab: string}) => {
    const dispatch = useDispatch();

    const [inputValue, setInputValue] = useState("")
    const [searchQuery, setSearchQuery] = useState("")

    const debouncedSearch = useMemo(() =>
        debounceUtil((searchString: string) => {
        setSearchQuery(searchString.trim())
    }, 500),
    []
    )

    const handleChSearchOnChange = (chName: string) => {
        setInputValue(chName);
        if (chName.trim().length >= 3) {
            debouncedSearch(chName);
        } else {
            debouncedSearch("");
        }
    }

    // A tab, once opened, stays mounted (hidden while another shows), so
    // switching back shows its cards where they were instead of remounting it:
    // that flashed the skeleton and put the list back on page 1 at the top.
    // A tab not yet opened isn't mounted, so it asks for nothing.
    const [seen, setSeen] = useState<Set<string>>(() => new Set([selectedTab]))
    if (!seen.has(selectedTab)) setSeen(new Set(seen).add(selectedTab))
    const create = useCallback(() => dispatch(openUI({ key: 'createDoc' })), [dispatch])

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="border-b border-border/60">
                <SearchField onChange={handleChSearchOnChange} value={inputValue} placeholder={"Search docs by title…"}/>
            </div>
            {seen.has("private") && (
                <div className={cn("flex-1 min-h-0 overflow-hidden flex-col", selectedTab === "private" ? "flex" : "hidden")} data-doc-tab="private">
                    <DocListTabPrivate searchQuery={searchQuery} onCreate={create}/>
                </div>
            )}
            {seen.has("public") && (
                <div className={cn("flex-1 min-h-0 overflow-hidden flex-col", selectedTab === "public" ? "flex" : "hidden")} data-doc-tab="public">
                    <DocListTabPublic searchQuery={searchQuery} onCreate={create}/>
                </div>
            )}
        </div>
    );
}