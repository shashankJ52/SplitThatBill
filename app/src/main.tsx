import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './app/routes'
import { AccountProvider, createAccount, type Account } from './data/account'
import { localRepository } from './data/persist'
import { AppProvider, createStore, type Store } from './data/store'
import { loggedOutState, seedState } from './domain/seed'
import { supabase } from './lib/supabase'

async function boot() {
  let store: Store
  let account: Account | null = null
  if (supabase) {
    // Backend configured: nobody is signed in until a saved session is resumed or someone logs in.
    store = createStore(loggedOutState())
    const acct = createAccount(store, supabase)
    account = acct
    await acct.ready
    // Another device may have changed things while this one was in the background.
    const refresh = () => void acct.refresh()
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh())
    window.addEventListener('online', refresh)
  } else {
    // No backend settings: start from sample data and keep changes in this browser.
    const saved = await localRepository.load()
    store = createStore(saved ?? seedState(), localRepository)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider store={store}>
        <AccountProvider account={account}>
          <RouterProvider router={router} />
        </AccountProvider>
      </AppProvider>
    </StrictMode>,
  )
}
void boot()
