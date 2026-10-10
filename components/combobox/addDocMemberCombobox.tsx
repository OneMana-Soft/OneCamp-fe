"use client"

import { displayNameOf } from "@/lib/personName"
import { useState, useEffect } from "react";
import { ChevronsUpDown } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
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
                            className="w-[180px] justify-between font-normal h-10 bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 transition-colors duration-150"
                            size="sm"
                        >
                            <span className="truncate text-sm font-medium">
                                {selectedUser
                                    ? displayNameOf(selectedUser)
                                    : "Search members…"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent portalled={false} className="w-[240px] p-0 shadow-xl border-border/50">
                        <Command shouldFilter={false}>
                            <CommandInput
                                placeholder="Search user…"
                                className="h-9"
                                value={searchQuery}
                                onValueChange={(val) => {
                                    setSearchQuery(val);
                                    if (selectedUser) setSelectedUser(null);
                                }}
                            />
                            <CommandList>
                                <CommandEmpty>{searchQuery.length < 2 ? "Type to search…" : "No user found"}</CommandEmpty>
                                <CommandGroup>
                                    {searchResults.map((user) => (
                                        <UserComboboxItem
                                            key={user.user_uuid}
                                            userUuid={user.user_uuid}
                                            userName={displayNameOf(user)}
                                            userFullName={user.user_full_name}
                                            userHandle={user.user_handle}
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
                    <SelectTrigger className="w-[110px] bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 transition-colors duration-150 h-10">
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
                    className="h-10 px-5 font-medium transition-colors duration-150 bg-primary hover:bg-primary/90 shrink-0"
                    disabled={!selectedUser || isInviting}
                >
                    Invite
                </Button>
            </div>
        </div>
    );
};

export default AddDocMemberCombobox;
