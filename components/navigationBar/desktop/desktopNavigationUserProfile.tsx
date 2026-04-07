"use client";

import { UserAvatarNav } from "@/components/navigationBar/userAvatarNav";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { useLogout } from "@/hooks/useLogout";

export default function DesktopNavigationUserProfile() {
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
    GetEndpointUrl.SelfProfile
  );
  const dispatch = useDispatch();
  const { logout } = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full focus-visible:ring-0 focus-visible:outline-none"
        >
          <UserAvatarNav
            userName={selfProfile.data?.data.user_name}
            userProfileObjKey={selfProfile.data?.data.user_profile_object_key}
            toolTipString={"Profile and settings"}
            userUUID={selfProfile.data?.data.user_uuid}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {selfProfile.data?.data.user_full_name}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {selfProfile.data?.data.user_email_id}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              dispatch(openUI({ key: "selfUserProfile" }));
            }}
          >
            Profile
            {/*<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>*/}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {/* <DropdownMenuSeparator /> */}
        <DropdownMenuItem onClick={logout}>
          Logout
          {/*<DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>*/}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
