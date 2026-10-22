import { fmt } from '../domain/util'
import type { ExportModel, ExportPerson } from './exportModel'

export type Look = 'sign' | 'receipt' | 'square'
export type Theme = 'dark' | 'light'

export const LOOKS: { value: Look; label: string; hint: string }[] = [
  { value: 'sign', label: 'Station sign', hint: 'Bold: the total and who owes what' },
  { value: 'receipt', label: 'Receipt', hint: 'Every item and who shared it' },
  { value: 'square', label: 'Square', hint: 'One glance, made for a group chat' },
]

const W = 1080
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace'
const ORANGE = '#FF6319'
const YELLOW = '#FCCC0A'

interface Ink {
  bg: string
  fg: string
  mute: string
  line: string
  owe: string
  get: string
}
const INK: Record<Theme, Ink> = {
  dark: { bg: '#000000', fg: '#ffffff', mute: '#9a9fa5', line: '#2c2c2c', owe: '#ff6b64', get: '#3ccf74' },
  light: { bg: '#ffffff', fg: '#000000', mute: '#5d6166', line: '#d9d9d5', owe: '#c9201a', get: '#00793a' },
}

type Ctx = CanvasRenderingContext2D

/** Make a canvas of the given size at its real pixel size (the picture is always 1080 wide, however big the screen). */
function make(h: number): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement('canvas')
  c.width = W
  c.height = h
  const x = c.getContext('2d') as Ctx
  x.textBaseline = 'alphabetic'
  return { c, x }
}

const font = (x: Ctx, size: number, weight: number | string = 400, family = SANS) => (x.font = `${weight} ${size}px ${family}`)

/** Shorten text with an ellipsis until it fits the width. */
function fit(x: Ctx, text: string, max: number): string {
  if (x.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && x.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function text(x: Ctx, s: string, px: number, py: number, color: string, align: CanvasTextAlign = 'left') {
  x.fillStyle = color
  x.textAlign = align
  x.fillText(s, px, py)
}

function bullet(x: Ctx, cx: number, cy: number, r: number, color: string, letter: string, ink = '#fff') {
  x.fillStyle = color
  x.beginPath()
  x.arc(cx, cy, r, 0, Math.PI * 2)
  x.fill()
  font(x, Math.round(r * 1.05), 700)
  const dark = color === YELLOW || color === '#6CBE45' || color === '#A7A9AC'
  text(x, letter, cx, cy + r * 0.37, dark ? '#000' : ink, 'center')
}

function roundRect(x: Ctx, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath()
  x.moveTo(px + r, py)
  x.arcTo(px + w, py, px + w, py + h, r)
  x.arcTo(px + w, py + h, px, py + h, r)
  x.arcTo(px, py + h, px, py, r)
  x.arcTo(px, py, px + w, py, r)
  x.closePath()
}

const owesText = (m: ExportModel, net: number) => (net > 0 ? `owes ${fmt(net, m.currency)}` : `is owed ${fmt(-net, m.currency)}`)
const meta = (m: ExportModel) => [m.loc, m.date, m.groupName].filter(Boolean).join(' · ')
const MAX_ROWS = 8

/** The footer both bold looks share: the app's name with its tagline, and the bill link when asked for. */
function footer(x: Ctx, m: ExportModel, ink: Ink, y: number, showLink: boolean) {
  font(x, 28, 700)
  text(x, 'SplitThatBill', 64, y, ink.mute)
  const w = x.measureText('SplitThatBill  ').width
  text(x, 'The Right Way', 64 + w, y, ORANGE)
  if (showLink && m.link) {
    font(x, 24, 400)
    text(x, fit(x, m.link.replace(/^https?:\/\//, ''), 480), W - 64, y, ink.mute, 'right')
  }
}

// ---------------------------------------------------------------------------------------------------------------
// A: the station sign
// ---------------------------------------------------------------------------------------------------------------
function drawSign(m: ExportModel, ink: Ink, showLink: boolean): HTMLCanvasElement {
  const rows = m.settle.slice(0, MAX_ROWS)
  const more = m.settle.length - rows.length
  const h = 64 + 96 + 60 + 40 + 30 + 190 + 30 + rows.length * 104 + (more > 0 ? 70 : 0) + (rows.length ? 20 : 0) + 120
  const { c, x } = make(h)
  x.fillStyle = ink.bg
  x.fillRect(0, 0, W, h)

  let y = 64
  bullet(x, 64 + 44, y + 44, 44, YELLOW, 'S')
  font(x, 66, 700)
  text(x, fit(x, m.title, W - 64 * 2 - 120), 64 + 120, y + 62, ink.fg)
  y += 96 + 28
  font(x, 30, 400)
  const sub = [meta(m), m.paidBy ? `Paid by ${m.paidBy}` : ''].filter(Boolean).join(' · ')
  text(x, fit(x, sub, W - 128), 64, y + 24, ink.mute)
  y += 60

  // the plate: the total between two heavy rules
  x.fillStyle = ink.fg
  x.fillRect(64, y, W - 128, 8)
  y += 30
  font(x, 120, 700)
  text(x, fmt(m.total, m.currency), 64, y + 112, ink.fg)
  font(x, 32, 400)
  text(x, m.people.length > 1 ? `split ${m.people.length} ways` : '', W - 64, y + 108, ink.mute, 'right')
  y += 146
  x.fillStyle = ink.fg
  x.fillRect(64, y, W - 128, 8)
  y += 40

  rows.forEach((r, i) => {
    bullet(x, 64 + 36, y + 40, 36, r.person.color, r.person.letter)
    font(x, 46, 700)
    text(x, fit(x, r.person.name, 420), 64 + 100, y + 56, ink.fg)
    font(x, 42, 700)
    text(x, owesText(m, r.net), W - 64, y + 54, r.net > 0 ? ink.owe : ink.get, 'right')
    if (i < rows.length - 1) {
      x.fillStyle = ink.line
      x.fillRect(64, y + 92, W - 128, 2)
    }
    y += 104
  })
  if (more > 0) {
    font(x, 32, 400)
    text(x, `+ ${more} more`, 64, y + 40, ink.mute)
    y += 70
  }
  footer(x, m, ink, h - 56, showLink)
  return c
}

// ---------------------------------------------------------------------------------------------------------------
// B: the receipt
// ---------------------------------------------------------------------------------------------------------------
function drawReceipt(m: ExportModel, ink: Ink, showLink: boolean): HTMLCanvasElement {
  const PAPER = '#fffef2'
  const TEXT = '#1c1c1c'
  const FAINT = '#7a766a'
  const RED = '#b3261e'
  const margin = 56
  const px = margin
  const pw = W - margin * 2
  const lines = m.lines
  const settle = m.settle.slice(0, MAX_ROWS)
  const more = m.settle.length - settle.length
  const rowH = 54
  const h =
    margin + 70 + 50 + (m.loc || m.date ? 40 : 0) + 36 + (lines.length ? lines.length * rowH : 60) + (m.extras.length ? 24 + m.extras.length * 48 : 0) + 36 + 80 + 40 + settle.length * 52 + (more > 0 ? 48 : 0) + (m.paidBy ? 56 : 0) + 120 + margin
  const { c, x } = make(h)
  x.fillStyle = ink.bg === '#000000' ? '#111111' : '#f0efe9'
  x.fillRect(0, 0, W, h)

  // the paper, with a torn bottom edge
  const bottom = h - margin
  x.fillStyle = PAPER
  x.beginPath()
  x.moveTo(px, margin)
  x.lineTo(px + pw, margin)
  x.lineTo(px + pw, bottom - 20)
  const teeth = 36
  for (let i = 0; i < teeth; i++) {
    const tx = px + pw - (i + 0.5) * (pw / teeth)
    x.lineTo(tx, bottom)
    x.lineTo(px + pw - (i + 1) * (pw / teeth), bottom - 20)
  }
  x.lineTo(px, margin)
  x.closePath()
  x.fill()

  const inner = px + 48
  const innerR = px + pw - 48
  const dash = (yy: number) => {
    x.strokeStyle = '#b9b6a5'
    x.lineWidth = 3
    x.setLineDash([14, 10])
    x.beginPath()
    x.moveTo(inner, yy)
    x.lineTo(innerR, yy)
    x.stroke()
    x.setLineDash([])
  }

  let y = margin + 70
  font(x, 44, 700, MONO)
  const title = m.title.toUpperCase()
  text(x, fit(x, title, pw - 96), px + pw / 2, y, TEXT, 'center')
  y += 44
  if (m.loc || m.date) {
    font(x, 26, 400, MONO)
    text(x, fit(x, meta(m), pw - 96), px + pw / 2, y, FAINT, 'center')
    y += 40
  }
  y += 10
  dash(y)
  y += 26

  if (lines.length) {
    lines.forEach((l) => {
      font(x, 28, 400, MONO)
      const price = fmt(l.price, m.currency)
      const pwid = x.measureText(price).width
      // who shares it: small bullets just left of the price
      const shown = l.who.slice(0, 5)
      const bw = shown.length * 30
      const name = `${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}`
      text(x, fit(x, name, innerR - inner - pwid - bw - 40), inner, y + 30, TEXT)
      shown.forEach((w, i) => bullet(x, innerR - pwid - 20 - (shown.length - 1 - i) * 30 - 12, y + 20, 12, m.people[w].color, m.people[w].letter))
      font(x, 28, 400, MONO) // the bullets changed the font
      text(x, price, innerR, y + 30, TEXT, 'right')
      y += rowH
    })
  } else {
    font(x, 26, 400, MONO)
    text(x, 'Split by custom amounts', inner, y + 30, FAINT)
    y += 60
  }
  if (m.extras.length) {
    y += 6
    m.extras.forEach((e) => {
      font(x, 28, 400, MONO)
      text(x, e.label, inner, y + 30, FAINT)
      text(x, `${e.minus ? '-' : ''}${fmt(e.amt, m.currency)}`, innerR, y + 30, FAINT, 'right')
      y += 48
    })
  }
  y += 14
  dash(y)
  y += 20
  font(x, 40, 700, MONO)
  text(x, 'TOTAL', inner, y + 40, TEXT)
  text(x, fmt(m.total, m.currency), innerR, y + 40, TEXT, 'right')
  y += 70
  dash(y)
  y += 20

  const payer = m.settle.find((r) => r.net < 0)?.person.name ?? m.paidBy
  settle.forEach((r) => {
    font(x, 28, 400, MONO)
    const label = r.net > 0 ? `${r.person.name} owes ${payer}` : `${r.person.name} is owed`
    text(x, fit(x, label, innerR - inner - 240), inner, y + 34, TEXT)
    font(x, 30, 700, MONO)
    text(x, fmt(Math.abs(r.net), m.currency), innerR, y + 34, r.net > 0 ? RED : '#1b7f3b', 'right')
    y += 52
  })
  if (more > 0) {
    font(x, 26, 400, MONO)
    text(x, `+ ${more} more`, inner, y + 30, FAINT)
    y += 48
  }
  if (m.paidBy) {
    font(x, 26, 400, MONO)
    text(x, `Paid by ${m.paidBy}`, px + pw / 2, y + 40, FAINT, 'center')
    y += 56
  }
  font(x, 24, 700, MONO)
  const tag = 'SplitThatBill'
  const tagLine = 'The Right Way'
  const tw = x.measureText(`${tag}  ${tagLine}`).width
  const sx = px + pw / 2 - tw / 2
  text(x, tag, sx, y + 56, FAINT)
  text(x, tagLine, sx + x.measureText(`${tag}  `).width, y + 56, ORANGE)
  if (showLink && m.link) {
    font(x, 22, 400, MONO)
    text(x, fit(x, m.link.replace(/^https?:\/\//, ''), pw - 96), px + pw / 2, y + 96, FAINT, 'center')
  }
  return c
}

// ---------------------------------------------------------------------------------------------------------------
// C: the square summary
// ---------------------------------------------------------------------------------------------------------------
function drawSquare(m: ExportModel, ink: Ink, showLink: boolean): HTMLCanvasElement {
  const { c, x } = make(W)
  x.fillStyle = ink.bg
  x.fillRect(0, 0, W, W)
  const pad = 72

  bullet(x, pad + 36, pad + 36, 36, YELLOW, 'S')
  font(x, 50, 700)
  text(x, fit(x, m.title, W - pad * 2 - 100 - 170), pad + 100, pad + 54, ink.fg)
  font(x, 30, 400)
  text(x, m.date, W - pad, pad + 52, ink.mute, 'right')

  font(x, 210, 700)
  text(x, fmt(m.total, m.currency), pad - 6, pad + 300, ink.fg)
  font(x, 34, 400)
  const sub = [m.paidBy ? `Paid by ${m.paidBy}` : '', m.people.length > 1 ? `split ${m.people.length} ways` : '', m.groupName].filter(Boolean).join(' · ')
  text(x, fit(x, sub, W - pad * 2), pad, pad + 360, ink.mute)

  const owing = m.settle.filter((r) => r.net > 0)
  const rows = (owing.length ? owing : m.settle).slice(0, 5)
  const more = (owing.length ? owing : m.settle).length - rows.length
  const maxAmt = Math.max(1, ...rows.map((r) => Math.abs(r.net)))
  let y = pad + 410
  const barX = pad + 90
  const barMax = W - pad - barX
  rows.forEach((r: { person: ExportPerson; net: number }) => {
    bullet(x, pad + 36, y + 36, 36, r.person.color, r.person.letter)
    const bw = Math.max(260, (Math.abs(r.net) / maxAmt) * barMax)
    x.fillStyle = r.person.color
    roundRect(x, barX, y, bw, 72, 36)
    x.fill()
    const dark = r.person.color === YELLOW || r.person.color === '#6CBE45' || r.person.color === '#A7A9AC'
    font(x, 36, 700)
    text(x, fit(x, r.person.name, bw - 230), barX + 30, y + 48, dark ? '#000' : '#fff')
    text(x, fmt(Math.abs(r.net), m.currency), barX + bw - 30, y + 48, dark ? '#000' : '#fff', 'right')
    y += 92
  })
  if (more > 0) {
    font(x, 30, 400)
    text(x, `+ ${more} more`, pad, y + 30, ink.mute)
  }
  footer(x, m, ink, W - 48, showLink)
  return c
}

/** Draw the bill as a picture in the chosen look. Everything is drawn here on the device; nothing is uploaded. */
export function drawExport(m: ExportModel, look: Look, theme: Theme, showLink: boolean): HTMLCanvasElement {
  const ink = INK[theme]
  return look === 'sign' ? drawSign(m, ink, showLink) : look === 'receipt' ? drawReceipt(m, ink, showLink) : drawSquare(m, ink, showLink)
}

/** The file name for a picture: "trattoria-roma-bill.png". */
export const exportFileName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bill'}-split.png`
