import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './app/routes'
import { localRepository } from './data/persist'
import { AppProvider, createStore } from './data/store'
import { seedState } from './domain/seed'

async function boot() {
  // Until the backend exists the app starts from sample data and keeps changes in this browser.
  const saved = await localRepository.load()
  const store = createStore(saved ?? seedState(), localRepository)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider store={store}>
        <RouterProvider router={router} />
      </AppProvider>
    </StrictMode>,
  )
}
void boot()
