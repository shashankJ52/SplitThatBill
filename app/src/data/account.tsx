import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { loggedOutState, seedState } from '../domain/seed'
import type { AppState } from '../domain/types'
import { resetUiState } from '../ui/uiState'
import { createCloudRepository, supabaseDb, type CloudRepository } from './cloud/cloudRepository'
import { setProfile } from './actions'
import { localKeyRepository } from './persist'
import type { Store } from './store'

/** out: nobody signed in. demo: sample data kept on this device. cloud: a real account saved to the database. */
export type AccountMode = 'out' | 'demo' | 'cloud'
export type Result = { err?: string }

export interface Account {
  mode(): AccountMode
  subscribe(cb: () => void): () => void
  /** true after following a password-reset link */
  recovering(): boolean
  signUp(p: { name: string; email: string; tag: string; password: string }): Promise<Result & { needsConfirm?: boolean }>
  signIn(email: string, password: string): Promise<Result>
  signOut(): Promise<void>
  enterDemo(): Promise<void>
  /** null when the check could not be made */
  tagAvailable(tag: string): Promise<boolean | null>
  updateProfile(patch: { name?: string; tag?: string }): Promise<Result>
  changePassword(current: string, next: string): Promise<Result>
  /** Finish sign-up with the 6-digit code from the email. */
  verifySignup(email: string, code: string): Promise<Result>
  resendSignup(email: string): Promise<Result>
  requestReset(email: string): Promise<Result>
  setNewPassword(password: string): Promise<Result>
  /** Pull the latest from the database (another device may have changed things). */
  refresh(): Promise<void>
  email(): string
  /** resolves once any saved session has been resumed */
  ready: Promise<void>
}

const demoRepo = localKeyRepository('stb-demo-v1')
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function createAccount(store: Store, client: SupabaseClient): Account {
  let mode: AccountMode = 'out'
  let recovering = false
  let repo: CloudRepository | null = null
  let userEmail = ''
  const listeners = new Set<() => void>()
  const setMode = (m: AccountMode) => {
    mode = m
    listeners.forEach((l) => l())
  }

  const leave = () => {
    store.setRepository(null)
    store.replace(loggedOutState())
    resetUiState()
    repo = null
    userEmail = ''
    setMode('out')
  }

  async function enterCloud(userId: string, email: string): Promise<Result> {
    try {
      const r = createCloudRepository(supabaseDb(client, userId))
      const state = await r.load()
      repo = r
      userEmail = email
      store.setRepository(r)
      store.replace(state)
      setMode('cloud')
      return {}
    } catch (e) {
      console.error('Could not load the account:', msg(e))
      return { err: 'Could not load your data. Check your connection and try again.' }
    }
  }

  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true
      listeners.forEach((l) => l())
    }
    // signed out somewhere else (another tab, expired session)
    if (event === 'SIGNED_OUT' && mode === 'cloud') leave()
  })

  let ready: Promise<void> = Promise.resolve()
  const api: Account = {
    get ready() {
      return ready
    },
    mode: () => mode,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    recovering: () => recovering,
    email: () => userEmail,

    async signUp({ name, email, tag, password }) {
      const free = await api.tagAvailable(tag)
      if (free === false) return { err: `@${tag} is taken. Try another.` }
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { name, tag } } })
      if (error) {
        if (/already registered|already been registered/i.test(error.message)) return { err: 'That email already has an account. Log in instead.' }
        if (/database error/i.test(error.message)) return { err: `@${tag} was just taken. Try another.` }
        if (/rate limit/i.test(error.message)) return { err: 'Too many sign-ups right now. Wait a minute and try again.' }
        return { err: error.message }
      }
      // a user with no identities means the address is already registered (when email confirmation is on)
      if (data.user && data.user.identities?.length === 0) return { err: 'That email already has an account. Log in instead.' }
      if (!data.session || !data.user) return { needsConfirm: true }
      return enterCloud(data.user.id, email)
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error || !data.user) return { err: 'Wrong email or password' }
      return enterCloud(data.user.id, email)
    },

    async signOut() {
      if (mode === 'cloud') {
        await store.flush()
        await client.auth.signOut()
      } else if (mode === 'demo') await store.flush()
      leave()
    },

    async enterDemo() {
      const saved = await demoRepo.load()
      store.setRepository(demoRepo)
      store.replace(saved ?? seedState(Date.now()))
      setMode('demo')
    },

    async tagAvailable(tag) {
      const { data, error } = await client.rpc('tag_available', { t: tag.toLowerCase() })
      return error ? null : (data as boolean)
    },

    async updateProfile(patch) {
      const { data: u } = await client.auth.getUser()
      if (!u.user) return { err: 'You are signed out. Log in again.' }
      const { error } = await client.from('profiles').update(patch).eq('id', u.user.id)
      if (error) return { err: error.code === '23505' ? `@${patch.tag} is taken` : 'Could not save. Try again.' }
      store.update((s) => setProfile(s, patch))
      await store.flush()
      return {}
    },

    async changePassword(current, next) {
      // Prove the current password first, whatever the project setting says; a stolen open session must not be enough.
      if (!userEmail) return { err: 'You are signed out. Log in again.' }
      const check = await client.auth.signInWithPassword({ email: userEmail, password: current })
      if (check.error) return { err: 'Current password is wrong' }
      const { error } = await client.auth.updateUser({ password: next, current_password: current })
      if (!error) return {}
      if (/current password|incorrect|invalid/i.test(error.message)) return { err: 'Current password is wrong' }
      if (/same/i.test(error.message)) return { err: 'New password must be different' }
      return { err: error.message }
    },

    async verifySignup(email, code) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'signup' })
      if (error || !data.user || !data.session) return { err: "That code isn't right or has expired. Check it or request a new one." }
      return enterCloud(data.user.id, email)
    },

    async resendSignup(email) {
      const { error } = await client.auth.resend({ type: 'signup', email })
      if (error && /rate limit|seconds/i.test(error.message)) return { err: 'Please wait a minute before asking for another code.' }
      return error ? { err: 'Could not send a new code. Try again.' } : {}
    },

    async requestReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` })
      // the screen shows the same message whether or not the account exists, so only report limits
      if (error && /rate limit/i.test(error.message)) return { err: 'Too many requests. Wait a few minutes and try again.' }
      return {}
    },

    async setNewPassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) return { err: /same/i.test(error.message) ? 'New password must be different' : error.message }
      recovering = false
      await client.auth.signOut()
      leave()
      return {}
    },

    async refresh() {
      if (mode !== 'cloud' || !repo || store.dirty() || repo.pending()) return
      try {
        const { data } = await client.auth.getUser()
        if (!data.user) return leave()
        const fresh: AppState = await repo.load()
        if (!store.dirty() && !repo.pending()) store.replace(fresh)
      } catch {
        /* offline: keep what is on screen */
      }
    },
  }

  /** On startup: resume an existing session unless the page is a password-reset link. */
  ready = (async () => {
    if (window.location.pathname === '/reset') return
    const { data } = await client.auth.getSession()
    if (data.session) await enterCloud(data.session.user.id, data.session.user.email ?? '')
  })()

  return api
}

const Ctx = createContext<Account | null>(null)
export function AccountProvider({ account, children }: { account: Account | null; children: ReactNode }) {
  return <Ctx.Provider value={account}>{children}</Ctx.Provider>
}
/** The backend account, or null when the app runs on local data only. */
export const useAccount = () => useContext(Ctx)

export function useRecovering(): boolean {
  const a = useAccount()
  return useSyncExternalStore(a ? a.subscribe : () => () => undefined, () => (a ? a.recovering() : false))
}

export function useAccountMode(): AccountMode | 'local' {
  const a = useAccount()
  return useSyncExternalStore(a ? a.subscribe : () => () => undefined, () => (a ? a.mode() : 'local'))
}
