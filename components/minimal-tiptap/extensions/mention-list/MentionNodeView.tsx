import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import React from "react";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { cn } from "@/lib/utils/helpers/cn";

const MentionNodeView: React.FC<NodeViewProps> = (props) => {
  const dispatch = useDispatch();
  const { id, label } = props.node.attrs;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // id format is usually "uuid@uid" or just "uuid" depending on how it was saved
    // We try to extract the UUID part if it follows the pattern
    const userUUID = id.split('@')[0];
    
    if (userUUID) {
        dispatch(openUI({ key: 'otherUserProfile', data: { userUUID } }));
    }
  };

  return (
    <NodeViewWrapper className="inline-block">
      <span
        onClick={handleClick}
        className={cn(
          // A neutral chip at weight 500: a mention is a person, not a link or a
          // selection, so it does not spend the accent (design direction,
          // "Accent budget"). Kept identical to .static-rich's in index.css.
          "bg-sidebar-accent text-foreground hover:bg-input/60 rounded-sm px-1 py-px font-medium cursor-pointer transition-colors select-none",
          props.selected && "ring-2 ring-primary ring-offset-1"
        )}
        data-id={id}
        data-label={label}
        data-type="mention"
      >
        @{label}
      </span>
    </NodeViewWrapper>
  );
};

export default MentionNodeView;
