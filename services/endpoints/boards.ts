/**
 * The boards area's API endpoints: what only boards code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum BoardsGet {
    GetBoardList = "/board/getBoardList",
    GetBoardPermissions = "/board/getBoardPermissions",
    GetBoardAttachment = "/board/getBoardAttachment",
    GetBoardSnapshots = "/board/getBoardSnapshots",
    GetBoardViewers = "/board/getViewers",
}

export enum BoardsPost {
    UpdateBoard = "/board/updateBoard",
    GenerateBoardDiagramStream = "/board/aiGenerateStream",
    PlanBoardDiagram = "/board/aiPlan",
    RefineBoardDiagram = "/board/aiRefineDiagram",
    ClusterBoardContent = "/board/aiCluster",
    GenerateBoardUI = "/board/aiGenerateUI",
    RefineBoardUI = "/board/aiRefineUI",
    SearchUserForBoard = "/board/searchUsers",
    BoardCommentMention = "/board/commentMention",
    BoardCommentDelete = "/board/commentDelete",
    RestoreBoardSnapshot = "/board/restoreBoardSnapshot",
    RecordBoardView = "/board/recordView",
}
