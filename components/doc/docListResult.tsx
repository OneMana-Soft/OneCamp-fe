
import {DocInfoInterface} from "@/types/doc";
import {DocCard} from "@/components/doc/docCard";
import * as React from "react";
import {app_doc_path} from "@/types/paths";
import { useRouter } from "next/navigation";
import { Plus, FileText } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { VirtuosoGrid } from 'react-virtuoso';
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/ListSkeleton";

export const DocListResult = ({docList, onLoadMore, hasMore, isLoading, onCreate}: {docList: DocInfoInterface[], onLoadMore?: ()=>void, hasMore?: boolean, isLoading?: boolean, onCreate?: ()=>void}) => {
    const router = useRouter();
    
    // Merge potential "Create Doc" card into the data list
    // We use a discriminated union type approach or just a mixed array
    const data = React.useMemo(() => {
        const items: (DocInfoInterface | 'CREATE_CARD')[] = [...docList];
        if (onCreate) {
            items.unshift('CREATE_CARD');
        }
        return items;
    }, [docList, onCreate]);


    if (isLoading && docList.length === 0) {
        return <ListSkeleton rows={6} showAvatar={false} className="pt-6" />;
    }

    if(docList.length == 0 && !isLoading && !onCreate) {
        return (
            <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Create your first document to get started."
                className="h-full"
            />
        )
    }

    return (
        <div className="w-full flex-1 min-h-0 bg-background">
             <VirtuosoGrid
                style={{ height: '100%', width: '100%' }}
                totalCount={data.length}
                data={data}
                endReached={() => {
                     if (hasMore && !isLoading && onLoadMore) {
                         onLoadMore();
                     }
                }}
                components={{
                    List: ListContainer,
                    Item: ItemContainer,
                    Footer: () => (
                        <div className="flex justify-center py-4 w-full">
                            {isLoading && (
                                <span className="flex items-center gap-2 text-sm text-primary">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    Loading...
                                </span>
                            )}
                             {!hasMore && docList.length > 0 && (
                                <div className="text-xs text-muted-foreground p-4">End of list</div>
                            )}
                        </div>
                    )
                }}
                itemContent={(index, item) => {
                     if (!item) return null;
                     if (item === 'CREATE_CARD') {
                         return (
                            <div 
                                onClick={onCreate}
                                className={cn(
                                    "group relative flex flex-col items-center justify-center border border-dashed border-border rounded-lg bg-transparent hover:border-primary/40 hover:bg-accent/30 transition-all duration-150 cursor-pointer h-64 md:h-72"
                                )}
                            >
                                 <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                                    <Plus size={24} />
                                 </div>
                                 <span className="mt-3 text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                                    Blank document
                                 </span>
                            </div>
                         )
                     }
                     return (
                         <div className="block">
                             <DocCard doc={item} onClick={(id) => router.push(`${app_doc_path}/${id}`)} />
                         </div>
                     )
                }}
             />
        </div>
    )
}

// Custom Containers for Grid Layout
const ListContainer = React.forwardRef(({ style, children, ...props }: any, ref) => (
  <div
    ref={ref}
    {...props}
    style={{ ...style, display: 'flex', flexWrap: 'wrap' }}
    className="w-full max-w-[1400px] mx-auto px-4 md:px-8 py-6"
  >
    {children}
  </div>
));
ListContainer.displayName = "ListContainer";

const ItemContainer = React.forwardRef(({ children, ...props }: any, ref) => (
  <div
    ref={ref}
    {...props}
    // Responsive column sizing via Tailwind
    className="w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5 p-2"
  >
    {children}
  </div>
));
ItemContainer.displayName = "ItemContainer";
