"use client"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {OrgAvatarNav} from "@/components/navigationBar/orgAvatarNav";
import {useLogout} from "@/hooks/useLogout";

export default function DesktopNavigationOrgProfile() {
    const { logout } = useLogout();


    return (

        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <OrgAvatarNav/>

        </Button>
        //
        // <DropdownMenu>
        //     <DropdownMenuTrigger asChild>
        //         <Button variant="ghost" className="relative h-8 w-8 rounded-full">
        //             <OrgAvatarNav/>
        //
        //         </Button>
        //     </DropdownMenuTrigger>
        //     <DropdownMenuContent className="w-56" align="end" forceMount>
        //         <DropdownMenuLabel className="font-normal">
        //             <div className="flex flex-col space-y-1">
        //                 <p className="text-sm font-medium leading-none">Akash</p>
        //                 <p className="text-xs leading-none text-muted-foreground">
        //                     hwy@akash.page
        //                 </p>
        //             </div>
        //         </DropdownMenuLabel>
        //         <DropdownMenuSeparator />
        //         <DropdownMenuGroup>
        //             <DropdownMenuItem
        //
        //             >
        //                 Profile
        //                 {/*<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>*/}
        //             </DropdownMenuItem>
        //         </DropdownMenuGroup>
        //         {/* <DropdownMenuSeparator /> */}
        //         <DropdownMenuItem
        //             onClick={logout}
        //         >
        //             Logout
        //             {/*<DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>*/}
        //         </DropdownMenuItem>
        //     </DropdownMenuContent>
        // </DropdownMenu>
    )
}

