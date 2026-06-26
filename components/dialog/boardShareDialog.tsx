"use client"

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { Lock, Globe, Copy, Check, X } from "@/lib/icons";
import { User as UserIcon } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { toast } from "@/hooks/use-toast";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { BoardInfoInterface, BoardInfoResponse } from "@/types/board";
import AddBoardMemberCombobox from "@/components/combobox/addBoardMemberCombobox";
import { useUserAvatar } from "@/hooks/useUserAvatar";

type Role = "editor" | "viewer";

interface BoardShareDialogProps {
  dialogOpenState: boolean;
  setOpenState: () => void;
  boardId: string;
}

export function BoardShareDialog({ dialogOpenState, setOpenState, boardId }: BoardShareDialogProps) {
  const { data: permData } = useFetch<BoardInfoResponse>(
    dialogOpenState && boardId ? `${GetEndpointUrl.GetBoardPermissions}?board_uuid=${boardId}` : ''
  );

  const [permissions, setPermissions] = useState<BoardInfoInterface | undefined>(undefined);
  useEffect(() => {
    if (permData?.data) setPermissions(permData.data);
  }, [permData]);

  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const updatePermissions = usePost();
  const updateBoard = usePost();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  const currentUser = selfProfile?.data?.data;
  const isOwner = permissions?.board_created_by?.user_uuid === currentUser?.user_uuid;

  const handleInvite = async (user: UserProfileDataInterface, role: Role) => {
    if (!isOwner || !boardId) return;
    setIsUpdating(true);
    const payload: Record<string, unknown> = { board_uuid: boardId };
    if (role === 'editor') payload.add_editors = [user.user_uuid];
    if (role === 'viewer') payload.add_viewers = [user.user_uuid];

    await updatePermissions.makeRequest({
      apiEndpoint: PostEndpointUrl.UpdateBoardPermissions,
      payload,
      onSuccess: () => {
        setIsUpdating(false);
        setPermissions(prev => {
          if (!prev) return prev;
          const removeFromList = (list?: UserProfileDataInterface[]) => list?.filter(u => u.user_uuid !== user.user_uuid) || [];
          return {
            ...prev,
            board_editing_users: role === 'editor' ? [...(prev.board_editing_users || []), user] : removeFromList(prev.board_editing_users),
            board_reading_users: role === 'viewer' ? [...(prev.board_reading_users || []), user] : removeFromList(prev.board_reading_users),
          };
        });
        toast({ title: "Shared", description: `Added ${user.user_name} as ${role}` });
      },
      showToast: true,
    });
  };

  const handleRemoveUser = async (userUuid: string, role: Role) => {
    if (!boardId || !isOwner) return;
    setIsUpdating(true);
    const payload: Record<string, unknown> = { board_uuid: boardId };
    if (role === 'editor') payload.remove_editors = [userUuid];
    if (role === 'viewer') payload.remove_viewers = [userUuid];

    await updatePermissions.makeRequest({
      apiEndpoint: PostEndpointUrl.UpdateBoardPermissions,
      payload,
      onSuccess: () => {
        setIsUpdating(false);
        setPermissions(prev => {
          if (!prev) return prev;
          const key = role === 'editor' ? 'board_editing_users' : 'board_reading_users';
          const current = (prev[key] as UserProfileDataInterface[]) || [];
          return { ...prev, [key]: current.filter(u => u.user_uuid !== userUuid) };
        });
      },
      showToast: true,
    });
  };

  const handlePrivacyChange = async (val: string) => {
    if (!boardId || !isOwner) return;
    setIsUpdating(true);
    const isPrivate = val === "restricted";
    await updateBoard.makeRequest({
      apiEndpoint: PostEndpointUrl.UpdateBoard,
      payload: { board_uuid: boardId, board_private: isPrivate },
      onSuccess: () => {
        setIsUpdating(false);
        setPermissions(prev => (prev ? { ...prev, board_private: isPrivate } : prev));
      },
      showToast: true,
    });
  };

  const generalAccessValue = permissions?.board_private === false ? "public" : "restricted";

  return (
    <Dialog open={dialogOpenState} onOpenChange={(open) => !open && setOpenState()}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden bg-background border-border">
        <DialogHeader className="p-6 pb-4 text-start">
          <DialogTitle className="text-base font-semibold">Share board</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Manage who can view and edit this board.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 flex flex-col gap-6">
          {(isOwner && boardId) && (
            <div className="flex flex-col relative gap-2">
              <AddBoardMemberCombobox boardId={boardId} handleInvite={handleInvite} />
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People with access</Label>
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
              {permissions?.board_created_by && (
                <UserRow user={permissions.board_created_by} role="owner" onRemove={() => {}} isOwner={false} />
              )}
              {permissions?.board_editing_users?.map(u => (
                <UserRow key={u.user_uuid} user={u} role="editor" onRemove={() => handleRemoveUser(u.user_uuid, 'editor')} isOwner={isOwner} />
              ))}
              {permissions?.board_reading_users?.map(u => (
                <UserRow key={u.user_uuid} user={u} role="viewer" onRemove={() => handleRemoveUser(u.user_uuid, 'viewer')} isOwner={isOwner} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-border">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">General access</Label>
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-full transition-colors", permissions?.board_private ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                  {permissions?.board_private ? <Lock className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                </div>
                <div className="flex flex-col">
                  <Select value={generalAccessValue} onValueChange={handlePrivacyChange} disabled={isUpdating || !isOwner}>
                    <SelectTrigger className="h-auto p-0 border-none shadow-none focus:ring-0 text-sm font-medium hover:text-primary transition-colors justify-start gap-1 w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restricted">Restricted</SelectItem>
                      <SelectItem value="public">Anyone with the link can view</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {permissions?.board_private
                      ? "Only added people can open this board"
                      : "Anyone on the internet with the link can view"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="outline"
              size="sm"
              className={cn("rounded-full gap-2 transition-all", copied ? "border-green-500 text-green-600 dark:text-green-400 bg-green-500/10" : "text-primary border-primary/20 hover:bg-primary/5")}
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
            <Button onClick={setOpenState}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, role, onRemove, isOwner }: { user: UserProfileDataInterface, role: string, onRemove: () => void, isOwner: boolean }) {
  const { src: imageSrc } = useUserAvatar(user.user_profile_object_key);
  return (
    <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors group">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={imageSrc} />
          <AvatarFallback>{user.user_name?.charAt(0) || <UserIcon className="w-4 h-4" />}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-sm font-medium leading-none">{user.user_name}</span>
          <span className="text-xs text-muted-foreground">{user.user_email_id}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground capitalize">{role}</span>
        {(isOwner && role !== 'owner') && (
          <Button variant="ghost" size="icon" className="h-6 w-6 md:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
