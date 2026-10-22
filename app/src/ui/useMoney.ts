import { useCallback } from 'react'
import { useAppState } from '../data/store'
import { currencyOf, defaultCurrency, ledgerCurrency } from '../domain/selectors'
import type { AppLedger } from '../domain/types'
import { fmt } from '../domain/util'

/** The currency code for a ledger, given as the ledger or its id. With nothing, the account's own currency. */
export function useCurrency(ledger?: string | Pick<AppLedger, 'currency'> | null): string {
  const s = useAppState()
  if (typeof ledger === 'string') return ledgerCurrency(s, ledger)
  return ledger ? currencyOf(s, ledger) : defaultCurrency(s)
}

/** A money formatter bound to one ledger's currency: `const money = useMoney(ledger)`, then `money(cents)`. */
export function useMoney(ledger?: string | Pick<AppLedger, 'currency'> | null): (cents: number) => string {
  const code = useCurrency(ledger)
  return useCallback((cents: number) => fmt(cents, code), [code])
}
