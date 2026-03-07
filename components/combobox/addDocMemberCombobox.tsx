"use client"

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/helpers/cn";
import { getNameInitials } from "@/lib/utils/format/getNameIntials";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { UserProfileDataInterface } from "@/types/user";
import { UserComboboxItem } from "@/components/combobox/userComboboxItem";

type Role = "editor" | "viewer" | "commenter";

interface AddDocMemberComboboxProps {
    docId: string;
    handleInvite: (user: UserProfileDataInterface, role: Role) => Promise<void>;
}

const AddDocMemberCombobox: React.FC<AddDocMemberComboboxProps> = ({ docId, handleInvite }) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<UserProfileDataInterface[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface | null>(null);
    const [selectedRole, setSelectedRole] = useState<Role>("viewer");
    const [isInviting, setIsInviting] = useState(false);

    const searchUser = usePost();

    // Debounced search logic
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.length >= 2) {
                const res = await searchUser.makeRequest<{ searchText: string }, UserProfileDataInterface[]>({
                    apiEndpoint: PostEndpointUrl.SearchUserForDoc,
                    payload: { searchText: searchQuery }
                });

                if (res && Array.isArray(res)) {
                    setSearchResults(res);
                } else {
                    setSearchResults([]);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const onInviteClick = async () => {
        if (!selectedUser || !docId) return;
        setIsInviting(true);
        try {
            await handleInvite(selectedUser, selectedRole);
            setSelectedUser(null);
            setSearchQuery("");
            setSearchResults([]);
        } finally {
            setIsInviting(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-x-3 items-center">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-[180px] justify-between font-normal h-10 bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 hover:shadow-sm transition-all duration-300 rounded-xl"
                            size="sm"
                        >
                            <span className="truncate text-sm font-medium">
                                {selectedUser
                                    ? selectedUser.user_name
                                    : "Search members..."}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent portalled={false} className="w-[240px] p-0 shadow-xl border-border/50">
                        <Command shouldFilter={false}>
                            <CommandInput
                                placeholder="Search user..."
                                className="h-9"
                                value={searchQuery}
                                onValueChange={(val) => {
                                    setSearchQuery(val);
                                    if (selectedUser) setSelectedUser(null);
                                }}
                            />
                            <CommandList>
                                <CommandEmpty>{searchQuery.length < 2 ? "Type to search..." : "No user found"}</CommandEmpty>
                                <CommandGroup>
                                    {searchResults.map((user) => (
                                        <UserComboboxItem
                                            key={user.user_uuid}
                                            userUuid={user.user_uuid}
                                            userName={user.user_name}
                                            userEmail={user.user_email_id}
                                            userProfileObjectKey={user.user_profile_object_key}
                                            isSelected={selectedUser?.user_uuid === user.user_uuid}
                                            onSelect={() => {
                                                setSelectedUser(user);
                                                setSearchResults([]);
                                                setSearchQuery("");
                                                setOpen(false);
                                            }}
                                        />
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <Select value={selectedRole} onValueChange={(v: Role) => setSelectedRole(v)}>
                    <SelectTrigger className="w-[110px] bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 hover:shadow-sm transition-all duration-300 rounded-xl h-10">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="commenter">Commenter</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    onClick={onInviteClick}
                    size="sm"
                    className="h-10 px-5 font-semibold shadow-sm hover:shadow-md transition-all duration-300 active:scale-95 rounded-xl bg-primary hover:bg-primary/90 shrink-0"
                    disabled={!selectedUser || isInviting}
                >
                    Invite
                </Button>
            </div>
        </div>
    );
};

export default AddDocMemberCombobox;
