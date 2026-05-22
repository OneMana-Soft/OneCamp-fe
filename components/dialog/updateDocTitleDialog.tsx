"use client"

import {Button} from "@/components/ui/button";
import {Controller, useForm} from "react-hook-form";
import {z} from "zod";
import {zodResolver} from "@hookform/resolvers/zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {usePost} from "@/hooks/usePost";
import {PostEndpointUrl} from "@/services/endPoints";


const updateDocFormSchema = z.object({
    doc_title: z
        .string()
        .trim()
        .min(4, "Doc title must be at least 4 characters")
        .max(30, "Doc title must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Doc title must only contain letters, numbers, and underscores"),
});

type UpdateDocFormValues = z.infer<typeof updateDocFormSchema>;

interface UpdateDocDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    currentDocTitle: string;
    docId: string;
}

const UpdateDocTitleDialog: React.FC<UpdateDocDialogProps> = ({
                                                                  dialogOpenState,
                                                                  setOpenState,
                                                                currentDocTitle,
                                                                docId,
                                                              }) => {
    const {
        control,
        handleSubmit,
        reset,
        formState: { isValid },
    } = useForm<UpdateDocFormValues>({
        resolver: zodResolver(updateDocFormSchema),
        mode: "onChange",
        defaultValues: {
            doc_title: currentDocTitle,
        },
    });


    const { makeRequest, isSubmitting } = usePost();

    const onSubmit = (data: UpdateDocFormValues) => {
        makeRequest({
            apiEndpoint: PostEndpointUrl.UpdateDoc,
            payload: {
                doc_uuid: docId,
                doc_title: data.doc_title,
            }
        }).then(()=> {

            closeModal()
        });

    };

    const closeModal = () => {
        reset();
        setOpenState(false);
    };

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
                <DialogHeader>
                    <DialogTitle className="text-start">Create Document</DialogTitle>
                    <DialogDescription className="hidden">
                        Update document title
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-4 py-4 space-y-3">
                        <div className="grid gap-2">
                            <Label>Document Title</Label>
                            <Controller
                                name="doc_title"
                                control={control}
                                render={({field, fieldState: {error}}) => (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                {...field}
                                                id="docTitle"
                                                placeholder="Type document title"
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            {error && (
                                                <p className="text-xs md:text-sm text-destructive">{error.message}</p>
                                            )}
                                        </div>
                                    </>
                                )}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "Updating..." : "Update Title"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default UpdateDocTitleDialog;
