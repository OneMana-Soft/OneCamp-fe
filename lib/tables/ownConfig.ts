import { parseFieldConfig, type TableField } from "@/services/tableService"

/**
 * The config a field keeps when only its options, format or the like change:
 * as stored, without what the server writes on read (what a formula gives, why
 * it can't be worked out, a linked table's name) or names once (an option's
 * removal), which aren't the owner's to send back.
 */
export function ownConfig(field: TableField): Record<string, unknown> {
  const { result: _r, error: _e, table_name: _t, removed_options: _x, ...rest } = parseFieldConfig(field) as Record<string, unknown>
  void _r
  void _e
  void _t
  void _x
  return rest
}
