'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

type WorkspaceTab = 'text' | 'document' | 'image' | 'rewrite'
type ModalTab     = 'text' | 'documents' | 'ocr' | 'rewrite'

const WORKSPACE_TO_MODAL: Record<WorkspaceTab, ModalTab> = {
  text:     'text',
  document: 'documents',
  image:    'ocr',
  rewrite:  'rewrite',
}

interface Props {
  open:      boolean
  onClose:   () => void
  activeTab?: string
}

export function HelpModal({ open, onClose, activeTab }: Props) {
  const { t } = useI18n()

  const initialTab: ModalTab =
    activeTab && activeTab in WORKSPACE_TO_MODAL
      ? WORKSPACE_TO_MODAL[activeTab as WorkspaceTab]
      : 'text'

  const [tab, setTab] = useState<ModalTab>(initialTab)

  // Sync modal tab when workspace tab changes or modal opens
  useEffect(() => {
    if (open && activeTab && activeTab in WORKSPACE_TO_MODAL) {
      setTab(WORKSPACE_TO_MODAL[activeTab as WorkspaceTab])
    }
  }, [open, activeTab])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const TABS: { id: ModalTab; label: string }[] = [
    { id: 'text',      label: t.helpModal.tabs.text      },
    { id: 'documents', label: t.helpModal.tabs.documents },
    { id: 'ocr',       label: t.helpModal.tabs.ocr       },
    { id: 'rewrite',   label: t.helpModal.tabs.rewrite   },
  ]

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[200]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.helpModal.title}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201]
                   w-[calc(100%-2rem)] max-w-2xl max-h-[80vh] flex flex-col
                   bg-surface-container-lowest rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">help</span>
            <span className="font-semibold text-on-surface">{t.helpModal.title}</span>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-outline-variant/15 shrink-0 px-2">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'text-on-surface border-primary'
                  : 'text-on-surface-variant border-transparent hover:text-on-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-grow p-6 flex flex-col gap-5">

          {tab === 'text' && (
            <>
              <Section title={t.helpModal.text.howTitle}>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.helpModal.text.how}</p>
              </Section>
              <Section title={t.helpModal.text.tipsTitle}>
                <TipList items={[t.helpModal.text.tip1, t.helpModal.text.tip2, t.helpModal.text.tip3]} />
              </Section>
            </>
          )}

          {tab === 'documents' && (
            <>
              <Section title={t.helpModal.documents.howTitle}>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.helpModal.documents.how}</p>
              </Section>
              <Section title={t.helpModal.documents.formatsTitle}>
                <p className="text-sm font-medium text-on-surface">{t.helpModal.documents.formats}</p>
              </Section>
              <Section title={t.helpModal.documents.tipsTitle}>
                <TipList items={[t.helpModal.documents.tip1, t.helpModal.documents.tip2]} />
              </Section>
            </>
          )}

          {tab === 'ocr' && (
            <>
              <Section title={t.helpModal.ocr.howTitle}>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.helpModal.ocr.how}</p>
              </Section>
              <Section title={t.helpModal.ocr.tipsTitle}>
                <TipList items={[t.helpModal.ocr.tip1, t.helpModal.ocr.tip2, t.helpModal.ocr.tip3]} />
              </Section>
            </>
          )}

          {tab === 'rewrite' && (
            <>
              <Section title={t.helpModal.rewrite.howTitle}>
                <p className="text-sm text-on-surface-variant leading-relaxed">{t.helpModal.rewrite.how}</p>
              </Section>
              <Section title={t.helpModal.rewrite.modesTitle}>
                <TipList items={[t.helpModal.rewrite.modeRewrite, t.helpModal.rewrite.modeCorrect]} />
              </Section>
              <Section title={t.helpModal.rewrite.tipsTitle}>
                <TipList items={[t.helpModal.rewrite.tip1, t.helpModal.rewrite.tip2]} />
              </Section>
            </>
          )}

        </div>
      </div>
    </>,
    document.body,
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/70">{title}</h3>
      {children}
    </div>
  )
}

function TipList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant leading-relaxed">
          <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-primary" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}
