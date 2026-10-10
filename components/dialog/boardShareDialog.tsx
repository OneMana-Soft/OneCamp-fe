"use client"

import { displayNameOf } from "@/lib/personName"
import { eyebrowClass } from "@/components/ui/eyebrow"
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { toast } from "@/hooks/use-toast";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { BoardInfoInterface, BoardInfoResponse } from "@/types/board";
import AddBoardMemberCombobox from "@/components/combobox/addBoardMemberCombobox";
import { GuestLinkSection } from "@/components/guest/GuestLinkSection";
import { CopyLinkButton, GeneralAccessMark, ShareUserRow, generalAccessLine, withoutOwner } from "@/components/dialog/shareParts";

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
  const [isUpdating, setIsUpdating] = useState(false);

  const updatePermissions = usePost();
  const updateBoard = usePost();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
  const currentUser = selfProfile?.data?.data;
  const isOwner = permissions?.board_created_by?.user_uuid === currentUser?.user_uuid;
  // External sharing is owner/editor-only (backend enforces the same).
  const canShareExternally = isOwner || !!permissions?.board_editing_users?.some(u => u.user_uuid === currentUser?.user_uuid);

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
        toast({ title: "Shared", description: `Added ${displayNameOf(user)} as ${role}` });
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
      <DialogContent className="sm:max-w-md grid-cols-[minmax(0,1fr)] gap-0 p-0 overflow-hidden bg-background border-border">
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
            <Label className={eyebrowClass}>People with access</Label>
            <div className="-mx-2 flex max-h-[240px] flex-col overflow-y-auto">
              {permissions?.board_created_by && (
                <ShareUserRow user={permissions.board_created_by} role="owner" canRemove={false} />
              )}
              {withoutOwner(permissions?.board_editing_users, permissions?.board_created_by?.user_uuid).map(u => (
                <ShareUserRow key={u.user_uuid} user={u} role="editor" onRemove={() => handleRemoveUser(u.user_uuid, 'editor')} canRemove={isOwner} />
              ))}
              {withoutOwner(permissions?.board_reading_users, permissions?.board_created_by?.user_uuid).map(u => (
                <ShareUserRow key={u.user_uuid} user={u} role="viewer" onRemove={() => handleRemoveUser(u.user_uuid, 'viewer')} canRemove={isOwner} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-border">
            <Label className={eyebrowClass}>General access</Label>
            <div className="flex min-w-0 items-center justify-between group">
              <div className="flex min-w-0 items-center gap-3">
                <GeneralAccessMark restricted={!!permissions?.board_private} />
                <div className="flex min-w-0 flex-col">
                  <Select value={generalAccessValue} onValueChange={handlePrivacyChange} disabled={isUpdating || !isOwner}>
                    <SelectTrigger dense className="h-auto p-0 border-none shadow-none focus:ring-0 text-sm font-medium hover:text-foreground transition-colors justify-start gap-1 w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restricted">Only people added</SelectItem>
                      <SelectItem value="public">Everyone in the workspace</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {generalAccessLine(generalAccessValue as "restricted" | "public", "board")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Share to web — scoped, expiring external guest link */}
          {boardId && (
            <GuestLinkSection resourceType="board" resourceId={boardId} canShare={canShareExternally} />
          )}

          <div className="flex justify-between items-center pt-2">
            <CopyLinkButton />
            <Button onClick={setOpenState}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
