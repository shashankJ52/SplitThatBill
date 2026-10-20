import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppProvider, createStore } from '../data/store'
import { supabase } from '../lib/supabase'
import { toPublicView, type PublicBillData } from '../domain/publicBill'
import { Empty } from '../ui/bits'
import { Screen } from '../app/Screen'
import { PublicBill } from './PublicBill'

/** A bill opened from a share link. Works without an account and shows only this bill and first names. */
export function PublicBillLink() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<PublicBillData | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    let live = true
    void supabase.rpc('public_bill', { t: token }).then(({ data: d, error }) => live && setData(error ? null : (d as PublicBillData | null)))
    return () => {
      live = false
    }
  }, [token])

  // without a backend there is nothing to open
  const shown = supabase ? data : null
  const view = useMemo(() => (shown ? toPublicView(shown) : null), [shown])
  // a small state of its own, so nothing from the signed-in account can leak into this page
  const store = useMemo(() => (view ? createStore(view.state) : null), [view])

  if (shown === undefined)
    return (
      <Screen id="v-public">
        <div className="vbody"><p className="mute">Opening the bill…</p></div>
      </Screen>
    )
  if (!view || !store)
    return (
      <Screen id="v-public">
        <div className="vhead"><h1 className="display">Bill not found</h1></div>
        <div className="vbody"><Empty title="This link is not valid any more">Ask the person who sent it for a new one.</Empty></div>
      </Screen>
    )
  return (
    <AppProvider store={store}>
      <PublicBill bill={view.bill} onGet={() => nav('/welcome')} />
    </AppProvider>
  )
}
