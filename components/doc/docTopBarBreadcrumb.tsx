import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { DocInfoInterface } from "@/types/doc";
import * as React from "react";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { Share2 } from "@/lib/icons";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";

interface DocTopBarBreadcrumbProps {
    doc?: DocInfoInterface;
    canEdit?: boolean;
}

export function DocTopBarBreadcrumb({ doc, canEdit = false }: DocTopBarBreadcrumbProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [title, setTitle] = React.useState(doc?.doc_title || "Untitled Document");
    const inputRef = React.useRef<HTMLInputElement>(null);
    const { makeRequest } = usePost();
    const dispatch = useDispatch();

    React.useEffect(() => {
        if (doc?.doc_title) {
            setTitle(doc.doc_title);
        }
    }, [doc?.doc_title]);

    const handleSave = async () => {
        setIsEditing(false);
        if (!doc || title.trim() === doc.doc_title) return;
        
        const newTitle = title.trim() || "Untitled Document";
        setTitle(newTitle); // Optimistic update
        
        await makeRequest({
            apiEndpoint: PostEndpointUrl.UpdateDoc,
            payload: {
                doc_uuid: doc.doc_uuid,
                doc_title: newTitle,
            }
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave();
        } else if (e.key === "Escape") {
            setTitle(doc?.doc_title || "Untitled Document");
            setIsEditing(false);
        }
    };

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const [inputWidth, setInputWidth] = React.useState(0);
    const spanRef = React.useRef<HTMLSpanElement>(null);

    React.useLayoutEffect(() => {
        if (spanRef.current) {
            setInputWidth(spanRef.current.offsetWidth + 20); // +20 for some breathing room/cursor
        }
    }, [title, isEditing]);

    if (!doc) return <div className="h-6 w-32 bg-muted animate-pulse rounded" />;

    return (
        <div className="flex items-center justify-between w-full pr-4">
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/app/doc">Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        {isEditing ? (
                            <div className="relative">
                                 <span 
                                    ref={spanRef}
                                    className="absolute opacity-0 pointer-events-none text-sm font-medium whitespace-pre px-1"
                                    aria-hidden="true"
                                 >
                                    {title || "Untitled Document"}
                                 </span>
                                 <Input
                                    ref={inputRef}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onBlur={handleSave} // Save on blur
                                    onKeyDown={handleKeyDown}
                                    className="h-7 py-0 px-1 border-none shadow-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent text-sm font-medium p-0 m-0"
                                    style={{ width: `${Math.max(inputWidth, 50)}px` }}
                                 />
                            </div>
                        ) : (
                            <BreadcrumbPage 
                                className={cn(
                                    "px-1.5 py-0.5 rounded transition-colors text-sm font-medium truncate max-w-[300px] md:max-w-[500px]",
                                    canEdit ? "cursor-text hover:bg-accent" : "cursor-default"
                                )}
                                onClick={() => canEdit && setIsEditing(true)}
                                title={canEdit ? "Click to rename" : undefined}
                            >
                                {title}
                            </BreadcrumbPage>
                        )}
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            
            <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-2 ml-4"
                disabled={!canEdit}
                onClick={() => {
                    if (canEdit && doc) {

                        dispatch(openUI({ key: 'docShare', data: doc.doc_uuid }));
                    }
                }}
            >
                <Share2 className="w-4 h-4" />
                Share
            </Button>
        </div>
    )
}
