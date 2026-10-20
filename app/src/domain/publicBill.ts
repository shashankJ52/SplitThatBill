import type { AppBill, AppState } from './types'
import { emptyState } from './seed'

/** What the database function public_bill() returns for a share link. */
export interface PublicBillData {
  bill: Omit<AppBill, 'comments' | 'token' | 'by' | 'id'> & { id?: string }
  by: string
  /** first names only, keyed by person id */
  names: Record<string, string>
}

/**
 * Turn a share-link response into something the normal bill screens can show: the bill, and a tiny state that only
 * knows the first names that came with it. Nothing else about anyone is available here.
 */
export function toPublicView(d: PublicBillData | null): { bill: AppBill; state: AppState } | null {
  if (!d || !d.bill) return null
  const state = emptyState({ name: '', email: '', tag: '' }, '')
  state.people = Object.fromEntries(Object.entries(d.names ?? {}).map(([id, name]) => [id, { id, name, user: true }]))
  const bill = { ...d.bill, id: d.bill.id ?? 'shared', comments: [], token: '', by: d.by ?? '' } as AppBill
  return { bill, state }
}
