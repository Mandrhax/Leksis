// Groups glossaries (one per language pair, typically) under their optional `groupName` for display —
// pure, no database, used by both the admin list and the user-facing Settings toggle.

export interface GroupableGlossary {
  name: string
  groupName: string | null
}

export interface GlossaryGroupRow<T extends GroupableGlossary> {
  /** Group name, or the glossary's own name when it has no group. */
  label: string
  isGroup: boolean
  members: T[]
}

/**
 * One row per group (first-seen order), one row per ungrouped glossary. A blank/whitespace-only
 * group name is treated as ungrouped.
 */
export function groupGlossariesForDisplay<T extends GroupableGlossary>(items: T[]): GlossaryGroupRow<T>[] {
  const rows: GlossaryGroupRow<T>[] = []
  const byGroup = new Map<string, GlossaryGroupRow<T>>()

  for (const item of items) {
    const key = item.groupName?.trim()
    if (key) {
      let row = byGroup.get(key)
      if (!row) {
        row = { label: key, isGroup: true, members: [] }
        byGroup.set(key, row)
        rows.push(row)
      }
      row.members.push(item)
    } else {
      rows.push({ label: item.name, isGroup: false, members: [item] })
    }
  }

  return rows
}
