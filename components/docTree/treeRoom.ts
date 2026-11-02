// V-266: the room the sidebar's docs tree took when it last settled on this device. DocsTreeGroups keeps the
// tree's height under TREE_ROOM_KEY once its first level is known; the app's boot script (lib/appBoot) reads it
// before the first paint and sets --docs-tree-h on <html>; and the sidebar's stand-in (DocsSection's
// DocTreeSkeleton with `room`) takes that height. So nothing below the Docs section moves when the tree lands,
// for a returning visitor as for a new one (an empty tree's one row by default).
//
// The boot script writes the key out as text: a constant it imported would stay in every app page's shared code
// even though the script itself doesn't ship there. lib/appBoot.test holds its copy to this one.

/** The tree's settled height in px, as DocsTreeGroups measured it on this device. */
export const TREE_ROOM_KEY = "oc_docs_tree_h"
