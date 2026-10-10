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
import { nameSchema } from "@/lib/validation/names";


const updateDocFormSchema = z.object({
    doc_title: nameSchema("title", "Doc title"),
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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    {/* It said "Create Document" over a rename. */}
                    <DialogTitle className="text-start">Rename doc</DialogTitle>
                    <DialogDescription className="sr-only">
                        Give this doc a new title.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
                    <div className="grid gap-2">
                        <Label htmlFor="docTitle">Title</Label>
                        <Controller
                            name="doc_title"
                            control={control}
                            render={({field, fieldState: {error}}) => (
                                <>
                                    <Input
                                        {...field}
                                        id="docTitle"
                                        placeholder="Untitled"
                                        autoFocus
                                        aria-invalid={!!error}
                                    />
                                    {error && (
                                        <p className="text-sm text-danger-ink">{error.message}</p>
                                    )}
                                </>
                            )}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default UpdateDocTitleDialog;
