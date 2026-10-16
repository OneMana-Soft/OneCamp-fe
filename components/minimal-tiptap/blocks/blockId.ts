"use client"

import { registerBlock } from "@/components/docEditor/registry/registry"
import { BlockId } from "../extensions/block-id/blockId"
import { DOC_EDITORS, ORDER } from "./kinds"

// Every block in a doc has a stable id (extensions/block-id). It adds the
// blockId attribute to the other blocks' nodes rather than writing one of its
// own, so it names no schema entry; the manifest shows it on each block.
registerBlock({ id: "blockId", editors: DOC_EDITORS, edition: "both", order: ORDER.blockId, extensions: [BlockId], schema: [] })
