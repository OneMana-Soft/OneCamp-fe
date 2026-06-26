import {UserProfileDataInterface} from "@/types/user";

// BoardInfoInterface mirrors the Doc info shape for the collaborative board.
// The canvas state itself is not transported here (it lives in the Yjs
// document); this carries metadata and access flags only.
export interface BoardInfoInterface {
    board_uuid: string,
    id?: string,
    board_title: string,
    board_state?: string,
    board_snippet?: string,
    board_edit_access: number,
    board_read_access: number,
    board_comment_access: number,
    board_private: boolean,
    board_created_by: UserProfileDataInterface,
    board_editing_users?: UserProfileDataInterface[],
    board_reading_users?: UserProfileDataInterface[],
    board_commenting_users?: UserProfileDataInterface[],
    board_created_at: string,
    board_updated_at: string,
    board_mqtt_topic: string,
    board_deleted_at?: string,
}

export interface BoardInfoResponse {
    msg: string;
    data: BoardInfoInterface;
}

export interface BoardSidebarInfo {
    board_uuid: string;
    board_title: string;
}

// Boards listing (owned + shared), used by the /app/board landing page.
export interface BoardListItem {
    board_uuid: string;
    board_title: string;
    board_private?: boolean;
    board_thumbnail_key?: string;
    board_updated_at?: string;
    board_created_by?: UserProfileDataInterface;
}

export interface BoardListResponse {
    msg: string;
    pageCount?: number;
    data: {
        boards: BoardListItem[] | null;
        count: number;
    };
}

// AI diagram generation: the server returns a validated, laid-out graph that
// the client renders as editable Excalidraw elements.
export type BoardDiagramType =
    | "auto"
    | "flow"
    | "roadmap"
    | "journey"
    | "mindmap"
    | "orgchart"
    | "wireframe"
    | "ui-mobile"
    | "ui-desktop";

export interface BoardLaidNode {
    id: string;
    label: string;
    shape: "rectangle" | "ellipse" | "diamond";
    x: number;
    y: number;
    w: number;
    h: number;
    bgColor: string;
}

export interface BoardLaidEdge {
    from: string;
    to: string;
    label?: string;
}

// UI mockup mode (ui-mobile / ui-desktop): a device frame + laid-out components.
export interface BoardLaidFrame {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface BoardLaidComponent {
    role: string; // device|navbar|bar|button|input|image|card|divider|avatar|text
    variant?: string;
    text?: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface BoardGenerateResult {
    title: string;
    type: BoardDiagramType;
    nodes: BoardLaidNode[];
    edges: BoardLaidEdge[];
    device?: string;
    frames?: BoardLaidFrame[];
    components?: BoardLaidComponent[];
}

export interface BoardGenerateResponse {
    msg: string;
    data: BoardGenerateResult;
}

// Board snapshot (version history). The blob lives in object storage; this is
// the metadata surfaced in the version-history UI.
export interface BoardSnapshotContributor {
    user_uuid: string;
    user_full_name?: string;
    user_name?: string;
    user_profile_object_key?: string;
}

export interface BoardSnapshot {
    id: string;
    element_count: number;
    state_bytes: number;
    reason: "interval" | "mass_delete" | "manual";
    created_at: string;
    contributors?: BoardSnapshotContributor[];
}

export interface BoardSnapshotListResponse {
    msg: string;
    data: BoardSnapshot[] | null;
}

// Resource viewer ("Viewed by"). One entry per distinct viewer, showing their
// most recent view (Google Docs viewer-list model).
export interface ResourceViewer {
    user_uuid: string;
    user_full_name?: string;
    user_name?: string;
    user_profile_object_key?: string;
    first_viewed_at: string;
    last_viewed_at: string;
}

export interface ResourceViewersResponse {
    msg: string;
    data: ResourceViewer[] | null;
    count: number;
}
