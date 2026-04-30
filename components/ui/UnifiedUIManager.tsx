"use client"

import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store/store";
import dynamic from "next/dynamic";
import { closeUI } from "@/store/slice/uiSlice";

// Lazy load dialogs/drawers to keep bundle size small
const CreateChannelDialog = dynamic(() => import("@/components/dialog/createChannelDialog"), { ssr: false });
const CreateProjectDialog = dynamic(() => import("@/components/dialog/createProjectDialog"), { ssr: false });
const CreateTeamDialog = dynamic(() => import("@/components/dialog/createTeamDialog"), { ssr: false });
const CreateTaskDialog = dynamic(() => import("@/components/dialog/createTaskDialog"), { ssr: false });
const CreateDocDialog = dynamic(() => import("@/components/dialog/createDocDialog"), { ssr: false });
const EditProfileDialog = dynamic(() => import("@/components/dialog/editProfileDailog"), { ssr: false });
const OtherProfileDialog = dynamic(() => import("@/components/dialog/otherUserProfileDialog"), { ssr: false });
const UpdateStatusDialog = dynamic(() => import("@/components/dialog/updateUserStatusDialog"), { ssr: false });
const ConfirmAlertDialog = dynamic(() => import("@/components/dialog/confirmAlertDialog").then(mod => mod.ConfirmAlertDialog), { ssr: false });
const DocShareDialog = dynamic(() => import("@/components/dialog/docShareDialog").then(mod => mod.DocShareDialog), { ssr: false });
const CreateChatMessageDialog = dynamic(() => import("@/components/dialog/createChatMessageDialog"), { ssr: false });
const EditChannelDialog = dynamic(() => import("@/components/dialog/editChannelDialog"), { ssr: false });
const EditChannelMemberDialog = dynamic(() => import("@/components/dialog/editChannelMembers"), { ssr: false });
const EditTeamMemberDialog = dynamic(() => import("@/components/dialog/editTeamMembers"), { ssr: false });
const EditDmMemberDialog = dynamic(() => import("@/components/dialog/editDmMembers"), { ssr: false });
const MediaLightboxDialog = dynamic(() => import("@/components/dialog/attachmentLightboxDialog").then(mod => mod.MediaLightboxDialog), { ssr: false });
const ForwardMessage = dynamic(() => import("@/components/dialog/forwardMessage").then(mod => mod.ForwardMessage), { ssr: false });
const EditTeamNameDialog = dynamic(() => import("@/components/dialog/editTeamNameDialog"), { ssr: false });
const EditProjectMemberDialog = dynamic(() => import("@/components/dialog/editProjectMembers"), { ssr: false });
const EditProjectNameDialog = dynamic(() => import("@/components/dialog/editProjectNameDialog"), { ssr: false });
const RecordingPlayerDialog = dynamic(() => import("@/components/dialog/RecordingPlayerDialog").then(mod => mod.RecordingPlayerDialog), { ssr: false });
const UpdateDocTitleDialog =  dynamic(() => import("@/components/dialog/updateDocTitleDialog"), { ssr: false });
const AdminTeamMembersDialog = dynamic(() => import("@/components/dialog/adminTeamMembersDialog"), { ssr: false });
const AddInvitationDialog = dynamic(() => import("@/components/admin/AddInvitationDialog").then(mod => mod.AddInvitationDialog), { ssr: false });
const CreateCalendarEventDialog = dynamic(() => import("@/components/calendar/createCalendarEventDialog").then(mod => mod.CreateCalendarEventDialog), { ssr: false });


// Drawers
const OrgDrawer = dynamic(() => import("@/components/drawers/orgDrawer").then(mod => mod.OrgDrawer), { ssr: false });
const TaskDrawer = dynamic(() => import("@/components/drawers/taskDrawer").then(mod => mod.TaskDrawer), { ssr: false });
const UserProfileDrawer = dynamic(() => import("@/components/drawers/userProfileDrawer").then(mod => mod.UserProfileDrawer), { ssr: false });
const ChannelOptionsDrawer = dynamic(() => import("@/components/drawers/channelOptionsDrawer").then(mod => mod.ChannelOptionsDrawer), { ssr: false });
const ChatOptionsDrawer = dynamic(() => import("@/components/drawers/chatOptionsDrawer").then(mod => mod.ChatOptionsDrawer), { ssr: false });
const GroupChatOptionsDrawer = dynamic(() => import("@/components/drawers/groupChatOptionsDrawer").then(mod => mod.GroupChatOptionsDrawer), { ssr: false });
const ChannelMobileSheet = dynamic(() => import("@/components/sheets/channelMobileSheet").then(mod => mod.ChannelMobileSheet), { ssr: false });
const DocFilterOptionsDrawer = dynamic(() => import("@/components/drawers/docFilterOptionsDrawer").then(mod => mod.DocFilterOptionsDrawer), { ssr: false });
const DocOptionsDrawer = dynamic(() => import("@/components/drawers/docOptionsDrawer").then(mod => mod.DocOptionsDrawer), { ssr: false });
const EmojiPickerDrawer = dynamic(() => import("@/components/drawers/emojiPickerDrawer").then(mod => mod.EmojiPickerDrawer), { ssr: false });
const TaskFilterDrawer = dynamic(() => import("@/components/drawers/taskFilterDrawer").then(mod => mod.TaskFilterDrawer), { ssr: false });
const ProjectTaskFilterDrawer = dynamic(() => import("@/components/drawers/projectTaskFilterDrawer").then(mod => mod.ProjectTaskFilterDrawer), { ssr: false });
const TaskOptionsDrawer = dynamic(() => import("@/components/drawers/taskOptionsDrawer").then(mod => mod.TaskOptionsDrawer), { ssr: false });
const TeamOptionsDrawer = dynamic(() => import("@/components/drawers/teamOptionsDrawer").then(mod => mod.TeamOptionsDrawer), { ssr: false });
const MyTaskOptionsDrawer = dynamic(() => import("@/components/drawers/myTaskOptionsDrawer").then(mod => mod.MyTaskOptionsDrawer), { ssr: false });
const ProjectOptionsDrawer = dynamic(() => import("@/components/drawers/projectOptionsDrawer").then(mod => mod.ProjectOptionsDrawer), { ssr: false });
const CalendarOptionsDrawer = dynamic(() => import("@/components/drawers/calendarOptionsDrawer").then(mod => mod.CalendarOptionsDrawer), { ssr: false });


// Mobile Long Press Drawers
const ChannelMessageLongPressDrawer = dynamic(() => import("@/components/drawers/channelMessageLongPressDrawer").then(mod => mod.ChannelMessageLongPressDrawer), { ssr: false });
const ChatMessageLongPressDrawer = dynamic(() => import("@/components/drawers/chatMessageLongPressDrawer").then(mod => mod.ChatMessageLongPressDrawer), { ssr: false });
const GroupChatMessageLongPressDrawer = dynamic(() => import("@/components/drawers/groupChatMessageLongPressDrawer").then(mod => mod.GroupChatMessageLongPressDrawer), { ssr: false });
const PostMessageLongPressDrawer = dynamic(() => import("@/components/drawers/postMessageLongPressDrawer").then(mod => mod.PostMessageLongPressDrawer), { ssr: false });
const DmChatMessageLongPressDrawer = dynamic(() => import("@/components/drawers/dmChatMessageLongPressDrawer").then(mod => mod.DmChatMessageLongPressDrawer), { ssr: false });
const DmGroupChatMessageLongPressDrawer = dynamic(() => import("@/components/drawers/dmGroupChatMessageLongPressDrawer").then(mod => mod.DmGroupChatMessageLongPressDrawer), { ssr: false });
const PostCommentLongPressDrawer = dynamic(() => import("@/components/drawers/postCommentMessageLongPressDrawer").then(mod => mod.PostCommentMessageLongPressDrawer), { ssr: false });
const DmChatCommentLongPressDrawer = dynamic(() => import("@/components/drawers/dmChatCommentMessageLongPressDrawer").then(mod => mod.DmChatCommentMessageLongPressDrawer), { ssr: false });
const DocCommentLongPressDrawer = dynamic(() => import("@/components/drawers/docCommentMessageLongPressDrawer").then(mod => mod.DocCommentMessageLongPressDrawer), { ssr: false });
const ProjectLongPressDrawer = dynamic(() => import("@/components/drawers/projectLongPressDrawer").then(mod => mod.ProjectLongPressDrawer), { ssr: false });

export function UnifiedUIManager() {
  const dispatch = useDispatch();
  const ui = useSelector((state: RootState) => state.ui);

  return (
    <>
      {/* Dialogs */}
      {ui.createChannel.isOpen && (
        <CreateChannelDialog
          dialogOpenState={ui.createChannel.isOpen}
          setOpenState={() => dispatch(closeUI('createChannel'))}
        />
      )}
      
      {ui.createProject.isOpen && (
        <CreateProjectDialog
          dialogOpenState={ui.createProject.isOpen}
          setOpenState={() => dispatch(closeUI('createProject'))}
        />
      )}

      {ui.createTeam.isOpen && (
        <CreateTeamDialog
          dialogOpenState={ui.createTeam.isOpen}
          setOpenState={() => dispatch(closeUI('createTeam'))}
        />
      )}

      {ui.createTask.isOpen && (
        <CreateTaskDialog
          dialogOpenState={ui.createTask.isOpen}
          setOpenState={() => dispatch(closeUI('createTask'))}
        />
      )}

      {ui.createDoc.isOpen && (
        <CreateDocDialog
          dialogOpenState={ui.createDoc.isOpen}
          setOpenState={() => dispatch(closeUI('createDoc'))}
        />
      )}

      {ui.selfUserProfile.isOpen && (
        <EditProfileDialog
          dialogOpenState={ui.selfUserProfile.isOpen}
          setOpenState={() => dispatch(closeUI('selfUserProfile'))}
        />
      )}

      {ui.otherUserProfile.isOpen && (
        <OtherProfileDialog
          dialogOpenState={ui.otherUserProfile.isOpen}
          setOpenState={() => dispatch(closeUI('otherUserProfile'))}
          userUUID={ui.otherUserProfile.data.userUUID}
        />
      )}

      {ui.userStatusUpdate.isOpen && (
        <UpdateStatusDialog
          dialogOpenState={ui.userStatusUpdate.isOpen}
          setOpenState={() => dispatch(closeUI('userStatusUpdate'))}
          userUUID={ui.userStatusUpdate.data.userUUID}
        />
      )}

      {ui.confirmAlert.isOpen && (
        <ConfirmAlertDialog
          title={ui.confirmAlert.data.title}
          description={ui.confirmAlert.data.description}
          confirmText={ui.confirmAlert.data.confirmText}
          onConfirm={ui.confirmAlert.data.onConfirm}
          open={ui.confirmAlert.isOpen}
          onOpenChange={() => dispatch(closeUI('confirmAlert'))}
        />
      )}

      {ui.docShare.isOpen && (
        <DocShareDialog
          dialogOpenState={ui.docShare.isOpen}
          setOpenState={() => dispatch(closeUI('docShare'))}
          docId={ui.docShare.docId}
        />
      )}

      {ui.createChatMessage.isOpen && (
        <CreateChatMessageDialog
          dialogOpenState={ui.createChatMessage.isOpen}
          setOpenState={() => dispatch(closeUI('createChatMessage'))}
        />
      )}

      {ui.editChannel.isOpen && (
        <EditChannelDialog
          channelId={ui.editChannel.data.channelUUID}
          dialogOpenState={ui.editChannel.isOpen}
          setOpenState={() => dispatch(closeUI('editChannel'))}
        />
      )}

      {ui.editChannelMember.isOpen && (
        <EditChannelMemberDialog
          channelId={ui.editChannelMember.data.channelUUID}
          dialogOpenState={ui.editChannelMember.isOpen}
          setOpenState={() => dispatch(closeUI('editChannelMember'))}
        />
      )}

      {ui.editTeamMember.isOpen && (
        <EditTeamMemberDialog
          teamId={ui.editTeamMember.data.teamUUID}
          dialogOpenState={ui.editTeamMember.isOpen}
          setOpenState={() => dispatch(closeUI('editTeamMember'))}
        />
      )}

      {ui.editDmMember.isOpen && (
          <EditDmMemberDialog
              grpId={ui.editDmMember.data.grpId}
              dialogOpenState={ui.editDmMember.isOpen}
              setOpenState={() => dispatch(closeUI('editDmMember'))}
          />
      )}

      {ui.editProjectMember.isOpen && (
        <EditProjectMemberDialog
          projectId={ui.editProjectMember.data.projectUUID}
          dialogOpenState={ui.editProjectMember.isOpen}
          setOpenState={() => dispatch(closeUI('editProjectMember'))}
        />
      )}

      {ui.attachmentLightbox.isOpen && (
        <MediaLightboxDialog
          dialogOpenState={ui.attachmentLightbox.isOpen}
          setOpenState={() => dispatch(closeUI('attachmentLightbox'))}
          media={ui.attachmentLightbox.data.media}
          allMedia={ui.attachmentLightbox.data.allMedia}
          mediaGetUrl={ui.attachmentLightbox.data.mediaGetUrl}
        />
      )}

      {ui.forwardMessage.isOpen && (
        <ForwardMessage
          chatUUID={ui.forwardMessage.data.chatUUID}
          chatMessageID={ui.forwardMessage.data.chatMessageID}
          groupChatMsgID={ui.forwardMessage.data.groupChatMsgID}
          channelUUID={ui.forwardMessage.data.channelUUID}
          postUUID={ui.forwardMessage.data.postUUID}
          onOpenChange={() => dispatch(closeUI('forwardMessage'))}
          open={ui.forwardMessage.isOpen}
        />
      )}

      {ui.editTeamName.isOpen && (
        <EditTeamNameDialog
          dialogOpenState={ui.editTeamName.isOpen}
          setOpenState={() => dispatch(closeUI('editTeamName'))}
          teamId={ui.editTeamName.data.teamUUID}
        />
      )}

      {ui.editProjectName.isOpen && (
        <EditProjectNameDialog
          dialogOpenState={ui.editProjectName.isOpen}
          setOpenState={() => dispatch(closeUI('editProjectName'))}
          projectId={ui.editProjectName.data.projectUUID}
        />
      )}

      {ui.recordingPlayer.isOpen && (
        <RecordingPlayerDialog />
      )}

      {ui.docUpdateTitle.isOpen && (
          <UpdateDocTitleDialog
              dialogOpenState={ui.docUpdateTitle.isOpen}
              setOpenState={() => dispatch(closeUI('docUpdateTitle'))}
              docId={ui.docUpdateTitle.data.docId}
              currentDocTitle={ui.docUpdateTitle.data.title}
          />
      )}

      {ui.teamMembers.isOpen && (
        <AdminTeamMembersDialog
          isOpen={ui.teamMembers.isOpen}
          onOpenChange={() => dispatch(closeUI('teamMembers'))}
          teamId={ui.teamMembers.data.teamUUID}
          teamName={ui.teamMembers.data.teamName}
        />
      )}

      {ui.addInvitation.isOpen && (
        <AddInvitationDialog
          open={ui.addInvitation.isOpen}
          onOpenChange={() => dispatch(closeUI('addInvitation'))}
          onSuccess={() => {
            dispatch(closeUI('addInvitation'));
          }}
        />
      )}

      {ui.createCalendarEvent.isOpen && (
        <CreateCalendarEventDialog
          open={ui.createCalendarEvent.isOpen}
          onOpenChange={() => dispatch(closeUI('createCalendarEvent'))}
        />
      )}

      {/* Drawers */}

      {ui.orgProfileDrawer.isOpen && (
        <OrgDrawer
          drawerOpenState={ui.orgProfileDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('orgProfileDrawer'))}
        />
      )}

      {ui.taskOptionDrawer.isOpen && (
        <TaskDrawer
          drawerOpenState={ui.taskOptionDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('taskOptionDrawer'))}
          taskId={ui.taskOptionDrawer.data.taskId}
        />
      )}

      {ui.userProfileDrawer.isOpen && (
        <UserProfileDrawer
          drawerOpenState={ui.userProfileDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('userProfileDrawer'))}
        />
      )}

      {ui.channelOptionsDrawer.isOpen && (
        <ChannelOptionsDrawer
          drawerOpenState={ui.channelOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('channelOptionsDrawer'))}
          channelId={ui.channelOptionsDrawer.data.channelUUID}
        />
      )}

      {ui.chatOptionsDrawer.isOpen && (
        <ChatOptionsDrawer
          drawerOpenState={ui.chatOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('chatOptionsDrawer'))}
          chatId={ui.chatOptionsDrawer.data.chatUUID}
        />
      )}

      {ui.groupChatOptionsDrawer.isOpen && (
        <GroupChatOptionsDrawer
          drawerOpenState={ui.groupChatOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('groupChatOptionsDrawer'))}
          grpId={ui.groupChatOptionsDrawer.data.grpId}
        />
      )}

      {ui.channelInfoSheet.isOpen && (
        <ChannelMobileSheet
          open={ui.channelInfoSheet.isOpen}
          onOpenChange={() => dispatch(closeUI('channelInfoSheet'))}
          channelId={ui.channelInfoSheet.data.channelUUID}
        />
      )}

      {ui.docFilterOptionsDrawer.isOpen && (
        <DocFilterOptionsDrawer
          drawerOpenState={ui.docFilterOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('docFilterOptionsDrawer'))}
        />
      )}

      {ui.docOptionsDrawer.isOpen && (
        <DocOptionsDrawer
          drawerOpenState={ui.docOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('docOptionsDrawer'))}
          deleteMessage={ui.docOptionsDrawer.data.deleteDoc}
          docId={ui.docOptionsDrawer.data.docId}
          isOwner={ui.docOptionsDrawer.data.isOwner}
        />
      )}

      {ui.reactionPickerDrawer.isOpen && (
        <EmojiPickerDrawer
          reactionDrawerOpenState={ui.reactionPickerDrawer.isOpen}
          setReactionDrawerOpenState={() => dispatch(closeUI('reactionPickerDrawer'))}
          showCustomReactions={ui.reactionPickerDrawer.data.showCustomReactions}
          onReactionSelect={ui.reactionPickerDrawer.data.onReactionSelect}
        />
      )}

      {ui.taskFilterDrawer.isOpen && (
        <TaskFilterDrawer
          drawerOpenState={ui.taskFilterDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('taskFilterDrawer'))}
        />
      )}

      {ui.projectTaskFilterDrawer.isOpen && (
        <ProjectTaskFilterDrawer
          drawerOpenState={ui.projectTaskFilterDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('projectTaskFilterDrawer'))}
          projectId={ui.projectTaskFilterDrawer.data.projectUUID}
        />
      )}

      {ui.taskOptionsDrawer.isOpen && (
        <TaskOptionsDrawer
          drawerOpenState={ui.taskOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('taskOptionsDrawer'))}
        />
      )}

      {ui.teamOptionDrawer.isOpen && (
        <TeamOptionsDrawer
          drawerOpenState={ui.teamOptionDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('teamOptionDrawer'))}
          teamId={ui.teamOptionDrawer.data.teamId}
          teamName={ui.teamOptionDrawer.data.teamName}
        />
      )}

      {ui.myTaskOptionsDrawer.isOpen && (
        <MyTaskOptionsDrawer
          drawerOpenState={ui.myTaskOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('myTaskOptionsDrawer'))}
        />
      )}

      {ui.projectOptionsDrawer.isOpen && (
        <ProjectOptionsDrawer
          drawerOpenState={ui.projectOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('projectOptionsDrawer'))}
          projectId={ui.projectOptionsDrawer.data.projectUUID}
        />
      )}

      {ui.calendarOptionsDrawer.isOpen && (
        <CalendarOptionsDrawer
          drawerOpenState={ui.calendarOptionsDrawer.isOpen}
          setOpenState={() => dispatch(closeUI('calendarOptionsDrawer'))}
        />
      )}

      {/* Long Press Drawers */}
      {ui.channelMessageLongPress.isOpen && (
        <ChannelMessageLongPressDrawer
          drawerOpenState={ui.channelMessageLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('channelMessageLongPress'))}
          onAddEmoji={ui.channelMessageLongPress.data.onAddReaction}
          channelUUID={ui.channelMessageLongPress.data.channelUUID}
          postUUID={ui.channelMessageLongPress.data.postUUID}
          editMessage={ui.channelMessageLongPress.data.editMessage}
          deleteMessage={ui.channelMessageLongPress.data.deleteMessage}
          isAdmin={ui.channelMessageLongPress.data.isAdmin}
          isOwner={ui.channelMessageLongPress.data.isOwner}
          handleEmojiClick={ui.channelMessageLongPress.data.handleEmojiClick}
          copyTextToClipboard={ui.channelMessageLongPress.data.copyTextToClipboard}
        />
      )}

      {ui.chatMessageLongPress.isOpen && (
        <ChatMessageLongPressDrawer
          drawerOpenState={ui.chatMessageLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('chatMessageLongPress'))}
          onAddEmoji={ui.chatMessageLongPress.data.onAddReaction}
          otherUserUUID={ui.chatMessageLongPress.data.otherUserUUID}
          chatUUID={ui.chatMessageLongPress.data.chatUUID}
          editMessage={ui.chatMessageLongPress.data.editMessage}
          deleteMessage={ui.chatMessageLongPress.data.deleteMessage}
          isAdmin={ui.chatMessageLongPress.data.isAdmin}
          isOwner={ui.chatMessageLongPress.data.isOwner}
          handleEmojiClick={ui.chatMessageLongPress.data.handleEmojiClick}
          copyTextToClipboard={ui.chatMessageLongPress.data.copyTextToClipboard}
        />
      )}

      {ui.groupChatMessageLongPress.isOpen && (
        <GroupChatMessageLongPressDrawer
          drawerOpenState={ui.groupChatMessageLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('groupChatMessageLongPress'))}
          onAddEmoji={ui.groupChatMessageLongPress.data.onAddReaction}
          grpId={ui.groupChatMessageLongPress.data.grpId}
          chatUUID={ui.groupChatMessageLongPress.data.chatUUID}
          editMessage={ui.groupChatMessageLongPress.data.editMessage}
          deleteMessage={ui.groupChatMessageLongPress.data.deleteMessage}
          isAdmin={ui.groupChatMessageLongPress.data.isAdmin}
          isOwner={ui.groupChatMessageLongPress.data.isOwner}
          handleEmojiClick={ui.groupChatMessageLongPress.data.handleEmojiClick}
          copyTextToClipboard={ui.groupChatMessageLongPress.data.copyTextToClipboard}
        />
      )}

      {ui.postMessageLongPress.isOpen && (
        <PostMessageLongPressDrawer
          drawerOpenState={ui.postMessageLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('postMessageLongPress'))}
          onAddEmoji={ui.postMessageLongPress.data.onAddReaction}
          channelUUID={ui.postMessageLongPress.data.channelUUID}
          postUUID={ui.postMessageLongPress.data.postUUID}
          copyTextToClipboard={ui.postMessageLongPress.data.copyTextToClipboard}
          deleteMessage={ui.postMessageLongPress.data.deleteMessage}
          editMessage={ui.postMessageLongPress.data.editMessage}
          handleEmojiClick={ui.postMessageLongPress.data.handleEmojiClick}
          isOwner={ui.postMessageLongPress.data.isOwner}
          isAdmin={ui.postMessageLongPress.data.isAdmin}
        />
      )}

      {ui.dmChatMessageLongPress.isOpen && (
        <DmChatMessageLongPressDrawer
          drawerOpenState={ui.dmChatMessageLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('dmChatMessageLongPress'))}
          onAddEmoji={ui.dmChatMessageLongPress.data.onAddReaction}
          otherUserUUID={ui.dmChatMessageLongPress.data.chatUUID}
          chatUUID={ui.dmChatMessageLongPress.data.chatMessageUUID}
          copyTextToClipboard={ui.dmChatMessageLongPress.data.copyTextToClipboard}
          deleteMessage={ui.dmChatMessageLongPress.data.deleteMessage}
          editMessage={ui.dmChatMessageLongPress.data.editMessage}
          handleEmojiClick={ui.dmChatMessageLongPress.data.handleEmojiClick}
          isOwner={ui.dmChatMessageLongPress.data.isOwner}
          isAdmin={ui.dmChatMessageLongPress.data.isAdmin}
        />
      )}

      {ui.dmGroupChatMessageLongPress.isOpen && (
        <DmGroupChatMessageLongPressDrawer
          drawerOpenState={ui.dmGroupChatMessageLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('dmGroupChatMessageLongPress'))}
          onAddEmoji={ui.dmGroupChatMessageLongPress.data.onAddReaction}
          grpId={ui.dmGroupChatMessageLongPress.data.grpId}
          chatUUID={ui.dmGroupChatMessageLongPress.data.chatMessageUUID}
          copyTextToClipboard={ui.dmGroupChatMessageLongPress.data.copyTextToClipboard}
          deleteMessage={ui.dmGroupChatMessageLongPress.data.deleteMessage}
          editMessage={ui.dmGroupChatMessageLongPress.data.editMessage}
          handleEmojiClick={ui.dmGroupChatMessageLongPress.data.handleEmojiClick}
          isOwner={ui.dmGroupChatMessageLongPress.data.isOwner}
          isAdmin={ui.dmGroupChatMessageLongPress.data.isAdmin}
        />
      )}

      {ui.postCommentLongPress.isOpen && (
        <PostCommentLongPressDrawer
          drawerOpenState={ui.postCommentLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('postCommentLongPress'))}
          onAddEmoji={ui.postCommentLongPress.data.onAddReaction}
          copyTextToClipboard={ui.postCommentLongPress.data.copyTextToClipboard}
          editMessage={ui.postCommentLongPress.data.editMessage}
          deleteMessage={ui.postCommentLongPress.data.deleteMessage}
          handleEmojiClick={ui.postCommentLongPress.data.handleEmojiClick}
          isOwner={ui.postCommentLongPress.data.isOwner}
          isAdmin={ui.postCommentLongPress.data.isAdmin}
        />
      )}

      {ui.dmChatCommentLongPress.isOpen && (
        <DmChatCommentLongPressDrawer
          drawerOpenState={ui.dmChatCommentLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('dmChatCommentLongPress'))}
          onAddEmoji={ui.dmChatCommentLongPress.data.onAddReaction}
          copyTextToClipboard={ui.dmChatCommentLongPress.data.copyTextToClipboard}
          deleteMessage={ui.dmChatCommentLongPress.data.deleteMessage}
          editMessage={ui.dmChatCommentLongPress.data.editMessage}
          handleEmojiClick={ui.dmChatCommentLongPress.data.handleEmojiClick}
        />
      )}

      {ui.docCommentLongPress.isOpen && (
        <DocCommentLongPressDrawer
          drawerOpenState={ui.docCommentLongPress.isOpen}
          setOpenState={() => dispatch(closeUI('docCommentLongPress'))}
          onAddEmoji={ui.docCommentLongPress.data.onAddReaction}
          copyTextToClipboard={ui.docCommentLongPress.data.copyTextToClipboard}
          deleteMessage={ui.docCommentLongPress.data.deleteMessage}
          editMessage={ui.docCommentLongPress.data.editMessage}
          handleEmojiClick={ui.docCommentLongPress.data.handleEmojiClick}
          isOwner={ui.docCommentLongPress.data.isOwner}
        />
      )}

      {ui.projectLongPress.isOpen && (
          <ProjectLongPressDrawer
              drawerOpenState={ui.projectLongPress.isOpen}
              setOpenState={() => dispatch(closeUI('projectLongPress'))}
              isAdmin={ui.projectLongPress.data.isAdmin}
              isDeleted={ui.projectLongPress.data.isDeleted}
              projectId={ui.projectLongPress.data.projectId}
              teamId={ui.projectLongPress.data.teamId}
              isMember={ui.projectLongPress.data.isMember}
          />
      )}

    </>
  );
}
