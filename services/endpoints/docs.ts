/**
 * The docs area's API endpoints: what only docs code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum DocsGet {
    GetDocAttachment = "/doc/getDocAttachment",
    GetAllCommentOfDoc = "/doc/getCommentList",
    GetSourceLinks = "/link/source", // append /{source_type}/{source_uuid}
    GetRefLinks = "/link/ref", // append /{ref_type}/{ref_uuid}
    GetDocViewers = "/doc/getViewers",
    GetDocInsights = "/doc/getInsights",
}

export enum DocsPost {
    AddEntityLink = "/link/add",
    RemoveEntityLink = "/link/remove",
}

export const APPEND_BLOCKS_PATH = '/doc/blocks/append' // B1: blocks moved to another doc (router/docsBlocks.go)

export const CONNECTED_PATHS = { entities: '/entities', mentionAccess: '/doc/mentionAccess', todoTask: '/doc/todoTask', todoCheck: '/doc/todoTask/check' } as const // C1: chips, the @ list's access and to-dos that are tasks (router/docsConnected.go)
