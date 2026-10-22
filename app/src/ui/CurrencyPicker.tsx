import { CURRENCIES, currencyLabel, symbolOf } from '../domain/currency'
import { Bullet } from './bits'
import { Dropdown } from './Dropdown'

/** Choose a currency from the supported list (or from `codes` when only some make sense). */
export function CurrencyPicker({ value, onChange, label = 'Currency', codes }: { value: string; onChange: (code: string) => void; label?: string; codes?: string[] }) {
  const list = codes ?? CURRENCIES.map((c) => c.code)
  return (
    <Dropdown
      label={label}
      value={value}
      onChange={onChange}
      options={list.map((code) => ({ value: code, label: currencyLabel(code), icon: <Bullet letter={symbolOf(code).trim().charAt(0)} color="#0039A6" size={28} /> }))}
    />
  )
}
