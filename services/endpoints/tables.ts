/**
 * The tables area's API endpoints: what only tables code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum TablesGet {
    GetTableRows = "/tables", // append /{id}/rows
    GetTableFields = "/tables", // append /{id}/fields
    GetTableAIFills = "/tables", // append /{id}/ai-fills
    PickTableRows = "/tables", // append /{id}/rows/pick?q=
    GetTableRowHistory = "/tables", // append /{id}/rows/{rowId}/history?before=
    GetTableTrash = "/tables", // append /{id}/trash?before=
    GetTablesTrash = "/tables/trash",
    GetTableFile = "/tables", // append /{id}/files/{fileId}: the file's address
}

export enum TablesPost {
    // Tables (first-class structured-data entity). All writes are POST.
    CreateTable = "/tables", // POST /tables
    GenerateTable = "/tables/generate", // POST /tables/generate (AI)
    UpdateTable = "/tables", // append /{id}/update
    DeleteTable = "/tables", // append /{id}/delete
    CreateTableRow = "/tables", // append /{id}/rows
    PatchTableRow = "/tables", // append /{id}/rows/{rowId}/patch (only the cells sent)
    ChangeTableLinks = "/tables", // append /{id}/rows/{rowId}/links
    PreviewTableFormula = "/tables", // append /{id}/formula/preview
    BatchTableRows = "/tables", // append /{id}/rows/batch (up to 1,000 rows, one change set)
    MoveTableRows = "/tables", // append /{id}/rows/move
    UndoTableChange = "/tables", // append /{id}/undo
    RedoTableChange = "/tables", // append /{id}/redo
    RestoreTableTrash = "/tables", // append /{id}/trash/restore
    RestoreTable = "/tables", // append /{id}/restore
    AggregateTable = "/tables", // append /{id}/aggregate (read-only)
    QueryTableRows = "/tables", // append /{id}/query (read-only: a window of a view's rows, in its order)
    ExportTable = "/tables", // append /{id}/export (read-only: a view as an Excel workbook)
    SetTablePresence = "/tables", // append /{id}/presence (who is on it, and where)
    RunTableQueryPlan = "/tables", // append /{id}/query-plan (read-only, multi-step)
    CreateTableField = "/tables", // append /{id}/fields
    UpdateTableField = "/tables", // append /{id}/fields/{fieldId}/update
    DeleteTableField = "/tables", // append /{id}/fields/{fieldId}/delete
    FillTableAIColumn = "/tables", // append /{id}/fields/{fieldId}/ai-fill
    StopTableAIFill = "/tables", // append /{id}/fields/{fieldId}/ai-fill/stop
    TableViews = "/tables", // append /{id}/views, or /{id}/views/{viewId}/update, /delete or /lock
}
