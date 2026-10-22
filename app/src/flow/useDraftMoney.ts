import { useCallback } from 'react'
import { useAppState } from '../data/store'
import { draftCurrency, type Draft } from '../domain/draft'
import { fmt } from '../domain/util'

/** A money formatter for the bill being built, in the currency of the group or 1-1 split it is going to. */
export function useDraftMoney(d: Draft): (cents: number) => string {
  const s = useAppState()
  const code = draftCurrency(s, d)
  return useCallback((cents: number) => fmt(cents, code), [code])
}
