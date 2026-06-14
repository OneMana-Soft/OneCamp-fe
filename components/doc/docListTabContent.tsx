import {useMemo, useState} from "react";
import {SearchField} from "@/components/search/searchField";
import {debounceUtil} from "@/lib/utils/helpers/debounce";
import {DocListTabPrivate} from "@/components/doc/docListTabPrivate";
import {DocListTabPublic} from "@/components/doc/docListTabPublic";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";


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

    const renderTabs =  useMemo(() => {
        switch (selectedTab) {
            case 'private':
                return <DocListTabPrivate searchQuery={searchQuery} onCreate={() => dispatch(openUI({ key: 'createDoc' }))}/>
            case 'public':
                return <DocListTabPublic     searchQuery={searchQuery} onCreate={() => dispatch(openUI({ key: 'createDoc' }))}/>
        }
    }, [searchQuery, selectedTab, dispatch])


    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="border-b border-border/60">
                <SearchField onChange={handleChSearchOnChange} value={inputValue} placeholder={"Search via doc title..."}/>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{renderTabs}</div>
        </div>
    );
}