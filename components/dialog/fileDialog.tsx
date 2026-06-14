import Image from 'next/image';
import {UploadedFile} from "@/types/file";
import {getFileType} from "@/lib/utils/file/getFileType";
import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";


interface FileDialogProps {
    file: UploadedFile | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const FileDialog = ({ file, open, onOpenChange }: FileDialogProps) => {
    if (!file) return null;

    const fileType = getFileType(file.file.type);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogTitle className="sr-only">File Preview: {file.file.name}</DialogTitle>
                {fileType === 'image' && (
                    <Image
                        src={file.signedUrl || file.preview}
                        alt={file.file.name}
                        width={800}
                        height={600}
                        className="object-contain max-h-[80vh] w-full"
                    />
                )}
                {fileType === 'pdf' && (
                    <iframe
                        src={file.signedUrl || file.preview}
                        className="w-full h-[80vh]"
                    />
                )}
                {fileType === 'text' && (
                    <div className="max-h-[80vh] overflow-auto p-4">
                        {/* Add text content viewer */}
                        <pre>{/* Fetch and display text content */}</pre>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
