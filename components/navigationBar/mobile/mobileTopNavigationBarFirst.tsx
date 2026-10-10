"use client"

import {usePathname, useRouter} from "next/navigation";
import {useDispatch} from "react-redux";
import {OrgAvatarNav} from "@/components/navigationBar/orgAvatarNav";
import {openUI} from "@/store/slice/uiSlice";
import { ArrowLeft } from "@/lib/icons";
import {Button} from "@/components/ui/button";
import { goBack } from "@/lib/navigation/back";

/**
 * Back, the same everywhere: the previous screen in the app, or the page's
 * parent when the app has none behind it (opened from a notification or a
 * link), never out of the app (lib/navigation/back.ts). 44px, for a thumb.
 */
function BackButton() {
    const router = useRouter();
    const pathname = usePathname();
    return (
        <Button aria-label='Back' variant='ghost' size='icon' className="h-11 w-11" onClick={() => goBack(router, pathname)}>
            <ArrowLeft className='h-5' />
        </Button>
    );
}

/** The workspace's menu, on the top level of each tab. */
function OrgButton() {
    const dispatch = useDispatch();
    return (
        <button
            type="button"
            onClick={() => dispatch(openUI({ key: 'orgProfileDrawer' }))}
            aria-label="Open organization profile"
            className="h-11 w-11 flex items-center justify-center rounded-full"
        >
            <OrgAvatarNav/>
        </button>
    );
}

export function MobileTopNavigationBarFirst() {
    const path = usePathname().split('/')

    const renderComponent = () => {
        switch (path[2]) {
            case "myTask":
            case "project":
            case "team":
            case "create":
            case "forward":
            case "meet":
            case "search":
            case "home":
            case "ai":
            case "admin":
            case "calendar":
            case "profile":
            case "activity":
            case "later":
            case "inbox":
            case "user":

                if(path.length < 4)
                return <OrgButton/>;
                if(path.length < 6)
                    return <BackButton/>
                break;
            case "channel":
            case "chat":
                // The list is a tab's top level; a channel, a DM, a group and
                // their threads all go back (lib/navigation/back.ts knows where).
                return path.length < 4 ? <OrgButton/> : <BackButton/>;
            case "settings":
            case "goals":
                // A goal is opened from the Goals view or a project's chip: back returns there.
            case "templates":
                // Reached from the profile drawer, so back is the only way out that
                // does not involve the browser gesture. There was no case here at
                // all, which is how these pages ended up with an empty left slot.
                return <BackButton/>

            case "tables":
                if(path.length < 4)
                    return <OrgButton/>;
                return <BackButton/>

            case "doc":
            case "board":
            case "task":
            case "calls":
            case "posts":
            case "recordings":


                return <BackButton/>

            default:
                return <></>;
        }
    };

    return (
        <div className='flex justify-start'>
            {renderComponent()}
        </div>
    );
}