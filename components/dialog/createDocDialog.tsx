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
import {Switch} from "@/components/ui/switch";
import {DocInfoInterface} from "@/types/doc";
import {app_doc_path} from "@/types/paths";
import {useRouter} from "next/navigation";

const createDocFormSchema = z.object({
    doc_title: z
        .string()
        .trim()
        .min(4, "Doc title must be at least 4 characters")
        .max(30, "Doc title must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Doc title must only contain letters, numbers, and underscores"),
    doc_private: z.boolean(),
});

type CreateDocFormValues = z.infer<typeof createDocFormSchema>;

interface CreateDocDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

const CreateDocDialog: React.FC<CreateDocDialogProps> = ({
                                                                  dialogOpenState,
                                                                  setOpenState,
                                                              }) => {
    const {
        control,
        handleSubmit,
        reset,
        formState: { isValid },
    } = useForm<CreateDocFormValues>({
        resolver: zodResolver(createDocFormSchema),
        mode: "onChange",
        defaultValues: {
            doc_title: "",
            doc_private: false,
        },
    });

    const router = useRouter()

    const { makeRequest, isSubmitting } = usePost();

    const onSubmit = (data: CreateDocFormValues) => {
        makeRequest<CreateDocFormValues, DocInfoInterface>({
            payload: data,
            apiEndpoint: PostEndpointUrl.CreateDoc,
        }).then((res)=> {
            if(res && res.doc_uuid) {
                router.push(app_doc_path +'/'+res.doc_uuid);
            }
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
                        Create a new document
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

                        <div className="flex items-center space-x-4">
                            <Label>Private Document</Label>
                            <Controller
                                name="doc_private"
                                control={control}
                                render={({field}) => (
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />

                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "Creating..." : "Create Document"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateDocDialog;
