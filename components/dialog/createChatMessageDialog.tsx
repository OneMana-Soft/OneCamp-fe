"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {ForwardMessageDropdown} from "@/components/searchDropdown/fwdMsgToDropdown/fwdMsgToDropdown";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import {createOrUpdateFwdMsg} from "@/store/slice/fwdMessageSlice";
import {MessagePreview} from "@/components/message/MessagePreview";
import { LoaderCircle } from "@/lib/icons";
import * as React from "react";
import {
  SelectUserToMessageDropdown
} from "@/components/searchDropdown/selectUserToMessageDropdown/selectUserToMessageDropdown";
import {useCallback, useRef, useState} from "react";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {app_chat_path, app_grp_chat_path} from "@/types/paths";
import {useRouter} from "next/navigation";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {generateGroupChatId} from "@/lib/utils/generateGroupChatId";
import {useDispatch} from "react-redux";
import {createGrpChatLocally} from "@/store/slice/groupChatSlice";


interface updateUserStatusDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
}

const CreateChatMessageDialog: React.FC<updateUserStatusDialogProps> = ({
  dialogOpenState,
  setOpenState,
}) => {

  const router = useRouter();

  const [selectedUser, setSelectedUser] = useState<UserProfileDataInterface[]>([])
  const isSelfSelected = useRef(false)
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

  const dispatch = useDispatch();
  const handleSelectUsers = useCallback((users: UserProfileDataInterface[]) => {
    const found = users.find((u) => u.user_uuid == selfProfile.data?.data.user_uuid)

    isSelfSelected.current = !!found

    setSelectedUser(users)

  },[])

  const handleSendMessage = async () => {

    if(!selfProfile.data?.data.user_uuid) return

    // Deduplicate users based on user_uuid
    const uniqueUsersMap = new Map<string, UserProfileDataInterface>();
    selectedUser.forEach(u => {
        if (u.user_uuid && u.user_uuid !== selfProfile.data?.data.user_uuid) {
            uniqueUsersMap.set(u.user_uuid, u);
        }
    });
    
    const filteredUsers = Array.from(uniqueUsersMap.values());

    if(filteredUsers.length == 1) {
      router.push(app_chat_path + '/' + filteredUsers[0].user_uuid);
      closeModal()
      return

    }

    if(filteredUsers.length == 0) {
      router.push(app_chat_path + '/' + selfProfile.data?.data.user_uuid);
      closeModal()
      return

    }

    if(selfProfile.data?.data) {
      filteredUsers.push(selfProfile.data?.data || {})
    }

    const grpId = await generateGroupChatId(filteredUsers)

    if(grpId) {
      dispatch(createGrpChatLocally({grpId, participants: filteredUsers}))
      router.push(app_grp_chat_path + '/' + grpId);
      closeModal()

    }

    closeModal()

  }

  const renderButtonText = () => {

    if(selectedUser.length > 2) return 'Create Group'

    if(selectedUser.length > 1 && !isSelfSelected.current)  return 'Create Group'

    return 'Send Message'
  }

  function closeModal() {
    setOpenState(false);
  }

  return (
      <Dialog open={dialogOpenState} onOpenChange={closeModal}  >
        <DialogContent className="max-w-[95vw] md:max-w-[35vw] space-y-2.5">
          <DialogHeader>
            <DialogTitle>Find users</DialogTitle>
            <DialogDescription >
            </DialogDescription>
          </DialogHeader>

          <SelectUserToMessageDropdown onSelect={handleSelectUsers}/>

          <DialogFooter>
            <Button onClick={handleSendMessage}
                    disabled={selectedUser.length == 0}
            >

              {renderButtonText()}
            </Button>
          </DialogFooter>
        </DialogContent>


      </Dialog>
  );
};

export default CreateChatMessageDialog;
