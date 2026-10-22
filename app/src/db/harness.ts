import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations')

/** The few pieces of Supabase the migrations lean on, so they can run in a plain local Postgres. */
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz, banned_until timestamptz
  );
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create function public.rls_auto_enable() returns void language sql as 'select 1';
`

export interface TestDb {
  db: PGlite
  /** Create a person the way sign-up does (the profile appears through the real trigger). */
  signUp(name: string, tag: string): Promise<string>
  /** Run as one signed-in person, as Supabase does for the API. Always returns to admin afterwards. */
  as<T>(uid: string, fn: () => Promise<T>): Promise<T>
  /** Run as a signed-out visitor holding only the public key. */
  anon<T>(fn: () => Promise<T>): Promise<T>
  sql(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  }
  const sql: TestDb['sql'] = async (text, params) => (await db.query(text, params as unknown[])).rows as Record<string, unknown>[]
  // Switching person is two statements, so two callers at once would trample each other. Take turns.
  let turn: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = turn.then(fn, fn)
    turn = run.catch(() => undefined)
    return run
  }
  const reset = async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`)
  }
  return {
    db,
    sql,
    async signUp(name, tag) {
      const r = await sql(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
        `${tag}@example.com`,
        JSON.stringify({ name, tag }),
      ])
      return r[0].id as string
    },
    as: (uid, fn) =>
      exclusive(async () => {
        await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`)
        try {
          return await fn()
        } finally {
          await reset()
        }
      }),
    anon: (fn) =>
      exclusive(async () => {
        await db.exec(`set role anon`)
        try {
          return await fn()
        } finally {
          await reset()
        }
      }),
  }
}
