import {useMemo, useState} from "react";
import {SearchField} from "@/components/search/searchField";
import {debounceUtil} from "@/lib/utils/helpers/debounce";
import {ProjectTaskList} from "@/components/project/projectTaskList";

export const ProjectTaskMobile = ({projectId}: {projectId: string})=>{
    const [inputValue, setInputValue] = useState("");
    const [searchQuery, setSearchQuery] = useState("")


    const debouncedSearch = useMemo(() =>
            debounceUtil((searchString: string) => {
                setSearchQuery(searchString.trim())
            }, 500),
        []
    )

    const handleSearchStringChange = (chName: string) => {
        setInputValue(chName);


        debouncedSearch(chName);


    }

    return (
        <div className="flex flex-col h-full">
            <SearchField onChange={handleSearchStringChange} value={inputValue} placeholder={"Search tasks…"}/>

            <div className="flex-1 overflow-hidden">
                <ProjectTaskList searchQuery={searchQuery} projectId={projectId}/>
            </div>
        </div>
    )
}