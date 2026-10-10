"use client"

import { displayNameOf } from "@/lib/personName"
import {useState} from "react";
import { ChevronsUpDown } from "@/lib/icons";
import {Button} from "@/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandList} from "@/components/ui/command";
import {useFetch} from "@/hooks/useFetch";
import {UserProfileDataInterface, UserListInterfaceResp} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {UserComboboxItem} from "@/components/combobox/userComboboxItem";

interface AddTeamMemberComboboxPropInterface {
    handleAddMember: (id: string, user?: UserProfileDataInterface) => void
    grpId: string
}

const AddDmMemberCombobox: React.FC<AddTeamMemberComboboxPropInterface> = ({handleAddMember, grpId}) => {


    const [open, setOpen] = useState(false)
    const [value, setValue] = useState("")

    const usersList = useFetch<UserListInterfaceResp>(grpId ? GetEndpointUrl.UserListNotBelongToDm + '/' + grpId : '')

    const handleOnClick = async (id: string) => {
        if(!id) return
        const selectedUser = usersList.data?.users?.find(u => u.user_uuid === id);
        await handleAddMember(id, selectedUser)
        setValue("")
    }

    return (
        <div className='flex gap-x-3'>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-[220px] justify-between font-normal h-10 bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 transition-colors duration-150"
                        size="sm"
                    >
                        <span className="truncate text-sm font-medium">
                            {value
                                ? displayNameOf(usersList.data?.users?.find((framework) => framework.user_uuid === value))
                                : "Search members…"
                            }
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent portalled={false} className="w-[240px] p-0 shadow-xl border-border/50">
                    <Command>
                        <CommandInput placeholder="Search user…" className="h-9" />
                        <CommandList>
                            <CommandEmpty>{"No user found"}</CommandEmpty>
                            <CommandGroup>
                                {usersList.data?.users?.map((user) => (
                                    <UserComboboxItem
                                        key={user.user_uuid}
                                        userUuid={user.user_uuid}
                                        userName={displayNameOf(user)}
                                        userFullName={user.user_full_name}
                                        userHandle={user.user_handle}
                                        userEmail={user.user_email_id}
                                        userProfileObjectKey={user.user_profile_object_key}
                                        isSelected={value === user.user_uuid}
                                        isBot={user.is_bot}
                                        onSelect={(currentValue) => {
                                            setValue(currentValue === value ? "" : currentValue)
                                            setOpen(false)
                                        }}
                                    />
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            <Button 
                variant="default" 
                size="sm" 
                className="h-10 px-5 font-medium transition-colors duration-150 bg-primary hover:bg-primary/90" 
                onClick={()=>{handleOnClick(value)}}
                disabled={!value}
            >
                Add member
            </Button>
        </div>

    )
}

export default AddDmMemberCombobox;
