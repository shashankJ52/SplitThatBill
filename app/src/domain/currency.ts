/**
 * Currencies a group or an account can use. Amounts are whole hundredths of the currency (cents, pence, paise) and are
 * never converted: the currency only decides the symbol. Currencies without hundredths (yen, won) are left out for now.
 * The symbols match `currency_symbol()` in supabase/migrations/0009_group_currency.sql, which words the server's alerts.
 */
export const CURRENCIES = [
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British pound', symbol: '£' },
  { code: 'INR', name: 'Indian rupee', symbol: '₹' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$' },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF ' },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong dollar', symbol: 'HK$' },
  { code: 'AED', name: 'UAE dirham', symbol: 'AED ' },
  { code: 'MXN', name: 'Mexican peso', symbol: 'MX$' },
  { code: 'BRL', name: 'Brazilian real', symbol: 'R$' },
  { code: 'ZAR', name: 'South African rand', symbol: 'R' },
  { code: 'CNY', name: 'Chinese yuan', symbol: 'CN¥' },
  { code: 'THB', name: 'Thai baht', symbol: '฿' },
] as const

export const DEFAULT_CURRENCY = 'USD'

export const isCurrency = (c: unknown): c is string => typeof c === 'string' && CURRENCIES.some((x) => x.code === c)
/** A code from outside (the database, an old save), or the default when it is missing or unknown. */
export const currencyOr = (c: unknown, fallback = DEFAULT_CURRENCY): string => (isCurrency(c) ? c : fallback)
export const symbolOf = (code: string): string => CURRENCIES.find((x) => x.code === code)?.symbol ?? '$'
export const currencyLabel = (code: string): string => {
  const c = CURRENCIES.find((x) => x.code === code)
  return c ? `${c.code} · ${c.name} (${c.symbol.trim()})` : code
}

/** Cents written in a currency: "$1,234.56", "-€2.50", "CHF 10.00". */
export function formatMoney(c: number, code: string = DEFAULT_CURRENCY): string {
  const s = c < 0 ? '-' : ''
  const a = Math.abs(c)
  return `${s}${symbolOf(code)}${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`
}
