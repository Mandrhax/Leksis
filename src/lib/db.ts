import { Pool } from 'pg'

// Singleton pool — réutilisé entre les requêtes en dev (hot-reload safe).
// Initialisation lazy : le pool n'est créé qu'au premier appel à query().
declare global {
  var _pgPool: Pool | undefined
}

function createPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined')
  const pool = new Pool({
    connectionString:        process.env.DATABASE_URL,
    max:                     10,
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis: 5_000,   // une base injoignable doit échouer vite, pas bloquer les requêtes
    statement_timeout:       30_000,  // aucune requête de l'application ne doit tourner plus longtemps
    application_name:        'leksis',
  })
  // Sans écouteur, l'erreur d'une connexion inactive (ex. redémarrage de PostgreSQL) est une exception non
  // interceptée qui arrête le processus Node : on la journalise, le pool rouvre une connexion à la demande.
  pool.on('error', err => console.error('[db] idle client error:', err.message))
  return pool
}

let _prodPool: Pool | undefined

function getPool(): Pool {
  if (process.env.NODE_ENV === 'development') {
    return (global._pgPool ??= createPool())
  }
  return (_prodPool ??= createPool())
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getPool().query(text, params as any) as any
}

type TxQuery = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) => Promise<{ rows: T[]; rowCount: number | null }>

/**
 * Exécute `fn` dans une transaction : COMMIT si elle réussit, ROLLBACK si elle lève.
 * `fn` reçoit un `query` lié à la connexion de la transaction (ne pas utiliser le `query` global dedans).
 */
export async function withTransaction<R>(fn: (q: TxQuery) => Promise<R>): Promise<R> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fn((text, params) => client.query(text, params as any) as any)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
