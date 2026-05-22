"use client"


import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import ChannelMemberContent from "@/components/member/channelMemberContent";


interface EditTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    channelId: string
}

const EditChannelMemberDialog: React.FC<EditTeamDialogProps> = ({
                                                              dialogOpenState,
                                                              setOpenState,
                                                              channelId
                                                          }) => {


    const closeModal = () => {
        setOpenState(false);
    };



    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[35vw] h-[80vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-5 pb-3 border-b border-border/60 space-y-1">
                    <DialogTitle className="text-start text-base font-semibold">Channel members</DialogTitle>
                    <DialogDescription className="sr-only">
                        Manage channel members.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-hidden p-5 pt-3 flex flex-col">
                    <ChannelMemberContent channelId={channelId} />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditChannelMemberDialog;