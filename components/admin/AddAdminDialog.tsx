"use client"

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints"
import { UserListResponseInterface, AdminCreateOrRemoveInterface, UserProfileDataInterface } from "@/types/user"
import { useFetch } from "@/hooks/useFetch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Check, Search } from "@/lib/icons";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { useUserAvatar } from "@/hooks/useUserAvatar"

interface AddAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface UserPickRowProps {
  user: UserProfileDataInterface
  isSelected: boolean
  onSelect: (user: UserProfileDataInterface) => void
}

function UserPickRow({ user, isSelected, onSelect }: UserPickRowProps) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key)
  const seed = user.user_full_name || user.user_name || user.user_email_id || ""

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 p-2 rounded-md cursor-pointer transition-colors hover:bg-accent",
        isSelected && "bg-accent",
      )}
      onClick={() => onSelect(user)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={imageSrc} alt={seed} />
          <AvatarFallback className={cn("text-[10px] font-semibold", getAvatarFallbackClass(seed))}>
            {getNameInitials(seed)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium leading-none truncate">
            {user.user_full_name || user.user_name}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {user.user_email_id}
          </span>
        </div>
      </div>
      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
    </div>
  )
}

export const AddAdminDialog: React.FC<AddAdminDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface | null>(null)
  
  // Reuse existing user list endpoint for search
  // In a real app, we might want a dedicated search endpoint
  const { data: userData, isLoading } = useFetch<UserListResponseInterface>(
    open ? `${GetEndpointUrl.GetAdminUserList}?pageSize=50` : ""
  )
  
  const post = usePost()

  const filteredUsers = userData?.data?.filter(user => 
    (user.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     user.user_email_id?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    !user.user_is_admin
  ) || []

  const handleAddAdmin = async () => {
    if (!selectedUser) return

    await post.makeRequest<AdminCreateOrRemoveInterface>({
      apiEndpoint: PostEndpointUrl.CreateAdmin,
      payload: {
        user_uuid: selectedUser.user_uuid!,
      },
    })

    onSuccess()
    onOpenChange(false)
    setSelectedUser(null)
    setSearchTerm("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add Administrator
          </DialogTitle>
          <DialogDescription>
            Search for a user to promote them to an administrator role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <ScrollArea className="h-[250px] pr-4">
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  Loading users...
                </div>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <UserPickRow
                    key={user.user_uuid}
                    user={user}
                    isSelected={selectedUser?.user_uuid === user.user_uuid}
                    onSelect={setSelectedUser}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground italic">
                  {searchTerm ? "No matching users found." : "Start typing to search..."}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={post.isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddAdmin}
            disabled={!selectedUser || post.isSubmitting}
          >
            {post.isSubmitting ? "Promoting..." : "Promote to Admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
