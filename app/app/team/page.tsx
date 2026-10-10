"use client"

import {TeamList} from "@/components/team/TeamList";
import {useMedia} from "@/context/MediaQueryContext";

// The teams live in the sidebar from 640 up, but below 1024 the sidebar starts
// as a rail of icons, so on a tablet this page was empty with nowhere to pick
// a team from. A phone and a tablet list them here.
function TeamHomePage() {

    const { isMobile, isTablet } = useMedia();

    return (
        <>
            {(isMobile || isTablet) && <TeamList/>}
        </>
    )
}

export default TeamHomePage;