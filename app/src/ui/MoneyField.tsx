import { useState } from 'react'
import { parseMoney } from '../domain/util'
import { useToast } from './Toast'

interface Common {
  className?: string
  label: string
  placeholder?: string
  style?: React.CSSProperties
}

/** A dollar amount typed as text. It commits on blur or Enter and marks bad input instead of losing it. */
export function MoneyField({ cents, onCommit, className = 'price', label, placeholder, style, message = 'Enter a valid price like 12.50' }: Common & { cents: number; onCommit: (c: number) => void; message?: string }) {
  const toast = useToast()
  const shown = (cents / 100).toFixed(2)
  const [text, setText] = useState(shown)
  const [bad, setBad] = useState(false)
  // follow the stored value when it changes from elsewhere
  const [prev, setPrev] = useState(shown)
  if (prev !== shown) {
    setPrev(shown)
    setText(shown)
    setBad(false)
  }
  const commit = () => {
    const c = parseMoney(text)
    if (c === null) {
      setBad(true)
      toast(message)
      return
    }
    setBad(false)
    if (c !== cents) onCommit(c)
    else setText(shown)
  }
  return (
    <input
      className={`${className}${bad ? ' bad' : ''}`}
      style={style}
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setBad(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** A whole number such as a quantity. */
export function IntField({ value, onCommit, className = 'qty', label, message }: Common & { value: number; onCommit: (n: number) => void; message: string }) {
  const toast = useToast()
  const [text, setText] = useState(String(value))
  const [bad, setBad] = useState(false)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setText(String(value))
    setBad(false)
  }
  const commit = () => {
    const n = Number(text.trim())
    if (!/^\d+$/.test(text.trim()) || !Number.isInteger(n)) {
      setBad(true)
      toast(message)
      return
    }
    onCommit(n)
  }
  return (
    <input
      className={`${className}${bad ? ' bad' : ''}`}
      inputMode="numeric"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setBad(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
