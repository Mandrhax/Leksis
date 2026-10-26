import { describe, expect, it } from 'vitest'
import { groupGlossariesForDisplay } from '@/lib/glossary-groups'

const g = (name: string, groupName: string | null) => ({ name, groupName })

describe('groupGlossariesForDisplay', () => {
  it('keeps an ungrouped glossary as its own row, labelled by its name', () => {
    const rows = groupGlossariesForDisplay([g('Legal EN-FR', null)])
    expect(rows).toEqual([{ label: 'Legal EN-FR', isGroup: false, members: [g('Legal EN-FR', null)] }])
  })

  it('bundles glossaries sharing a group name into one row', () => {
    const en_fr = g('Watch EN-FR', 'Watch industry')
    const en_de = g('Watch EN-DE', 'Watch industry')
    const rows = groupGlossariesForDisplay([en_fr, en_de])
    expect(rows).toEqual([{ label: 'Watch industry', isGroup: true, members: [en_fr, en_de] }])
  })

  it('keeps the position of the first member, mixing grouped and ungrouped rows in order', () => {
    const legal = g('Legal', null)
    const watchFr = g('Watch EN-FR', 'Watch industry')
    const medical = g('Medical', null)
    const watchDe = g('Watch EN-DE', 'Watch industry')
    const rows = groupGlossariesForDisplay([legal, watchFr, medical, watchDe])
    expect(rows.map(r => r.label)).toEqual(['Legal', 'Watch industry', 'Medical'])
    expect(rows[1].members).toEqual([watchFr, watchDe])
  })

  it('treats a blank or whitespace-only group name as ungrouped', () => {
    expect(groupGlossariesForDisplay([g('A', '')])).toEqual([{ label: 'A', isGroup: false, members: [g('A', '')] }])
    expect(groupGlossariesForDisplay([g('B', '   ')])).toEqual([{ label: 'B', isGroup: false, members: [g('B', '   ')] }])
  })

  it('trims the group name before using it as the row label and the grouping key', () => {
    const a = g('A', ' Watch industry ')
    const b = g('B', 'Watch industry')
    const rows = groupGlossariesForDisplay([a, b])
    expect(rows).toEqual([{ label: 'Watch industry', isGroup: true, members: [a, b] }])
  })
})
