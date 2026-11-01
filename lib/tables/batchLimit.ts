/**
 * The most rows one batch writes (the server's Batch). Pure, so the grid's
 * range piece reads it without the ledger's HTTP client (lib/tables/ledger).
 */
export const BATCH_MAX = 1000
