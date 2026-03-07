"use client"

import {useState} from "react";
import {Check, ChevronsUpDown} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {cn} from "@/lib/utils/helpers/cn";
import {useFetch} from "@/hooks/useFetch";
import {UserListInterfaceResp} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {UserComboboxItem} from "@/components/combobox/userComboboxItem";

interface AddTeamMemberComboboxPropInterface {
    handleAddMember: (id: string) => void
    channelId: string
}

const AddChannelMemberCombobox: React.FC<AddTeamMemberComboboxPropInterface> = ({handleAddMember, channelId}) => {


    const [open, setOpen] = useState(false)
    const [value, setValue] = useState("")

    const usersList = useFetch<UserListInterfaceResp>(channelId ? GetEndpointUrl.UserListNotBelongToChannel + '/' + channelId : '')

    const handleOnClick = async (id: string) => {
        if(!id) return
        await handleAddMember(id)
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
                        className="w-[220px] justify-between font-normal h-10 bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 hover:shadow-sm transition-all duration-300 rounded-xl"
                        size="sm"
                    >
                        <span className="truncate text-sm font-medium">
                            {value
                                ? usersList.data?.users?.find((framework) => framework.user_uuid === value)?.user_name
                                : "Search members..."
                            }
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent portalled={false} className="w-[240px] p-0 shadow-xl border-border/50">
                    <Command>
                        <CommandInput placeholder="Search user..." className="h-9" />
                        <CommandList>
                            <CommandEmpty>{"No user found"}</CommandEmpty>
                            <CommandGroup>
                                {usersList.data?.users?.map((user) => (
                                    <UserComboboxItem
                                        key={user.user_uuid}
                                        userUuid={user.user_uuid}
                                        userName={user.user_name}
                                        userEmail={user.user_email_id}
                                        userProfileObjectKey={user.user_profile_object_key}
                                        isSelected={value === user.user_uuid}
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
                className="h-10 px-5 font-semibold shadow-sm hover:shadow-md transition-all duration-300 active:scale-95 rounded-xl bg-primary hover:bg-primary/90" 
                onClick={()=>{handleOnClick(value)}}
                disabled={!value}
            >
                Add Member
            </Button>
        </div>

    )
}

export default AddChannelMemberCombobox;
