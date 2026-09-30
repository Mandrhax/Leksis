import { DOCS_SECTIONS } from '@/lib/docs-content'

export function DocsView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
      <nav aria-label="Documentation sections" className="lg:sticky lg:top-6 hidden lg:block">
        <ul className="flex flex-col gap-0.5 text-sm">
          {DOCS_SECTIONS.map(section => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[1.05rem] leading-none flex-shrink-0" aria-hidden="true">
                  {section.icon}
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-4 min-w-0">
        {DOCS_SECTIONS.map(section => (
          <section
            key={section.id}
            id={section.id}
            className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-6 scroll-mt-6"
          >
            <h2 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl leading-none" aria-hidden="true">
                {section.icon}
              </span>
              {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </div>
    </div>
  )
}
