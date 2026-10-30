/**
 * The window event a job's MQTT message (MESSAGE_CONTENT_IO_JOB) is re-sent
 * as. Its own file: the app's message handler runs on every page, and
 * lib/export/contentIO would bring the import and export client with it.
 */
export const CONTENT_IO_JOB_EVENT = 'content-io-job'
