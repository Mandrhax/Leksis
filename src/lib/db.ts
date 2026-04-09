import { Pool } from 'pg'

// Singleton pool — réutilisé entre les requêtes en dev (hot-reload safe)
// Initialisation lazy : le pool n'est créé qu'au premier appel à query()
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

function getPool(): Pool {
  if (process.env.NODE_ENV === 'development') {
    if (!global._pgPool) {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined')
      global._pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
    }
    return global._pgPool
  }
  // Production : singleton via module-level variable (lazy)
  if (!_prodPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined')
    _prodPool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return _prodPool
}

let _prodPool: Pool | undefined

// Compat : certains imports utilisent encore `pool` directement
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getPool().query(text, params as any) as any
}
