/**
 * Every built-in block, one module per group, each registering its specs as
 * it loads (registry/index.ts imports this). What only a doc carries loads
 * when a doc's editor is first built (doc.ts), so the chat composer and a
 * task's description never fetch it.
 */
import "./text"
import "./inline"
import "./media"
import "./structure"
import "./behaviour"
import "./doc"
import "./blockId"
import "../extensions/clipboard-markdown/register"
