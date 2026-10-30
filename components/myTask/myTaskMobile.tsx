import {useMemo, useState, useEffect} from "react";
import {SearchField} from "@/components/search/searchField";
import {debounceUtil} from "@/lib/utils/helpers/debounce";
import {MyTaskList} from "@/components/myTask/myTaskList";
import dynamic from "next/dynamic";

// What waits for your answer shows once its read answers, so it comes in its own chunk.
const WaitingForMe = dynamic(() => import("@/components/work/approvals/WaitingForMe").then((m) => m.WaitingForMe), { ssr: false });

export const MyTaskMobile = ()=>{
    const [inputValue, setInputValue] = useState("");
    const [searchQuery, setSearchQuery] = useState("")


    const debouncedSearch = useMemo(() =>
            debounceUtil((searchString: string) => {
                setSearchQuery(searchString.trim())
            }, 500),
        []
    )


    useEffect(() => debouncedSearch.cancel, [debouncedSearch])

    const handleSearchStringChange = (chName: string) => {
        setInputValue(chName);


        debouncedSearch(chName);


    }

    return (
        <div className="flex flex-col h-full">
            {/* What waits for your answer sits beside the search, so the list never moves for it. */}
            <div className="flex items-center">
                <SearchField className="min-w-0 flex-1" onChange={handleSearchStringChange} value={inputValue} placeholder={"Search tasks…"}/>
                <WaitingForMe className="mr-3" />
            </div>

            <div className="flex-1 overflow-hidden">
                <MyTaskList searchQuery={searchQuery}/>
            </div>
        </div>
    )
}