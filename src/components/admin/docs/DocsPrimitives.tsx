import type { ReactNode } from 'react'

export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm text-on-surface leading-relaxed mt-3">{children}</p>
}

export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="font-headline text-sm font-semibold text-on-surface mt-6 first:mt-0">{children}</h3>
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-1.5 list-disc pl-5 text-sm text-on-surface leading-relaxed">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="bg-surface-container rounded px-1.5 py-0.5 text-[0.8em] font-mono text-on-surface">{children}</code>
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 bg-surface-container rounded-lg border border-outline-variant/20 px-4 py-3 text-xs text-on-surface-variant font-mono leading-relaxed overflow-x-auto whitespace-pre">
      {children}
    </pre>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 text-sm leading-relaxed flex gap-2 ${
      tone === 'warning' ? 'bg-error/5 border-error/30 text-on-surface' : 'bg-primary/5 border-primary/20 text-on-surface'
    }`}>
      <span className="material-symbols-outlined text-base leading-none shrink-0 mt-0.5" aria-hidden="true">
        {tone === 'warning' ? 'warning' : 'info'}
      </span>
      <div>{children}</div>
    </div>
  )
}

export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-outline-variant/20">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-surface-container">
            {headers.map((h, i) => (
              <th key={i} className="text-left font-semibold text-on-surface-variant uppercase tracking-wider px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-outline-variant/10">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2 align-top text-on-surface ${j === 0 ? 'font-mono whitespace-nowrap' : 'leading-relaxed'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
