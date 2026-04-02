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
        <Dialog onOpenChange={closeModal} open={dialogOpenState} >
            <DialogContent className="max-w-[95vw] md:max-w-[35vw] h-[80vh] flex flex-col p-0 overflow-hidden bg-background backdrop-blur-xl border-border/50 shadow-2xl">
                <DialogHeader className="p-6 pb-2 border-b border-border/50">
                    <DialogTitle className="text-start text-xl font-bold tracking-tight">Channel members</DialogTitle>
                    <DialogDescription className="hidden">
                        Channel members
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-hidden p-6 pt-2 flex flex-col">
                    <ChannelMemberContent channelId={channelId} />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditChannelMemberDialog;