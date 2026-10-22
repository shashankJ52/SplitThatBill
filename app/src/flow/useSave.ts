import { useNavigate } from 'react-router-dom'
import * as A from '../data/actions'
import { useStore } from '../data/store'
import { toBill, type Draft } from '../domain/draft'
import { findBill, ledgerById, ledgerName } from '../domain/selectors'
import { ME } from '../domain/types'
import { uid } from '../domain/util'
import { useToast } from '../ui/Toast'

/** Save the draft as a new bill, or write the edits back to the bill it came from. */
export function useSave() {
  const store = useStore()
  const nav = useNavigate()
  const toast = useToast()
  return (d: Draft) => {
    const st = store.get()
    if (d.editingId) {
      const comments = [...d.comments, { id: uid('c'), by: ME, text: 'You edited this bill', ts: Date.now(), sys: true }]
      store.update((s) => A.replaceBill(s, toBill({ ...d, comments })))
      toast('Bill updated')
    } else {
      // a second tap before the page changes must not save twice
      if (findBill(st, d.id)) return
      const bill = toBill(d)
      let name = ''
      store.update((s) => {
        let state = s
        let lid = d.gid ?? ''
        if (d.kind === 'one' && d.withP) {
          const r = A.ensureOneLedger(state, d.withP, uid('o'), d.currency)
          state = r.state
          lid = r.id
        }
        const l = ledgerById(state, lid)
        if (!l) return s
        name = ledgerName(state, l)
        return A.addBill(state, lid, bill)
      })
      if (!name) return toast('That group no longer exists. Pick another one.')
      toast(`Saved to ${name}`)
    }
    nav(`/bill/${d.id}`, { replace: true })
  }
}
