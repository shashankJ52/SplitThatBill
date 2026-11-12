/** What reading a receipt photo gives back, how to check it, and the instructions and shape the reading service is held to. */

/** The kinds of private detail the reader is told to leave out. The privacy screen lists the ones it came across. */
export const HIDDEN_KINDS = [
  'card number',
  'expiry date',
  'authorization code',
  'cardholder name',
  'phone number',
  'email address',
  'account or loyalty number',
  'signature',
] as const

export const CATEGORY_NAMES = ['Groceries', 'Eating out', 'Subscriptions', 'Furniture', 'Fuel & travel', 'Sports', 'Movies & fun', 'Other'] as const

export interface ScannedItem {
  name: string
  qty: number
  /** the whole line in cents (quantity times unit price) */
  cents: number
}

export interface ScanResult {
  merchant: string
  location: string
  category: string
  /** YYYY-MM-DD, or empty when the receipt shows no date */
  date: string
  items: ScannedItem[]
  tax: number
  tip: number
  discount: number
  total: number
  /** how many repeated lines were counted once because photos of the same receipt overlapped (0 for a single photo) */
  mergedLines: number
  /** private details seen on the receipt that were left out */
  hidden: string[]
}

/** JSON Schema the model's answer must follow. */
export const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_receipt', 'merchant', 'location', 'category', 'date', 'items', 'tax_cents', 'tip_cents', 'discount_cents', 'total_cents', 'overlap_lines_merged', 'hidden'],
  properties: {
    is_receipt: { type: 'boolean' },
    merchant: { type: 'string' },
    location: { type: 'string' },
    category: { type: 'string', enum: [...CATEGORY_NAMES] },
    date: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'qty', 'total_cents'],
        properties: { name: { type: 'string' }, qty: { type: 'integer' }, total_cents: { type: 'integer' } },
      },
    },
    tax_cents: { type: 'integer' },
    tip_cents: { type: 'integer' },
    discount_cents: { type: 'integer' },
    total_cents: { type: 'integer' },
    overlap_lines_merged: { type: 'integer' },
    hidden: { type: 'array', items: { type: 'string', enum: [...HIDDEN_KINDS] } },
  },
} as const

export const SCAN_PROMPT = `You read photos of purchase receipts for a bill-splitting app and return structured data.

Rules:
- All money is whole cents (12.50 becomes 1250). Use the receipt's own currency amounts and ignore the symbol.
- Each item's total_cents is the whole line (quantity times unit price). If the receipt shows a unit price and a quantity, multiply them. qty is how many were bought (at least 1).
- List only things that were bought. Leave out subtotal, total, tax, tip and payment lines; they have their own fields.
- tax_cents is all sales tax or VAT added on top of the items. tip_cents is any tip, gratuity or service charge. discount_cents is the total discount as a positive number, or 0.
- total_cents is the final amount charged, as printed.
- overlap_lines_merged is how many repeated lines you left out because several images of one receipt overlapped. It is 0 when there is a single image.
- date is the purchase date as YYYY-MM-DD, or an empty string if you cannot tell.
- merchant is the store or restaurant name; location is its street address or city if printed, otherwise an empty string.
- category is the closest match from the allowed list.
- If the image is not a receipt, or nothing is legible, set is_receipt to false and leave the rest empty or zero.

Privacy, strictly: never write down card numbers, expiry dates, authorization or approval codes, cardholder names, phone numbers, email addresses, loyalty or account numbers, or signatures. Do not include them anywhere in your answer, not even partly. Instead, add the matching kind to "hidden" for each kind you noticed on the receipt. The merchant's own address stays in location.`

/** Added to the instructions when one receipt arrives as several images (a long receipt captured in parts). */
export const multiPageNote = (n: number) => `This receipt is shown as ${n} images, in order from the top of the receipt to the bottom, because it is long and was captured in parts. Read them as ONE receipt.
- Neighbouring images often overlap: the last lines of one image can appear again at the top of the next. A line that appears twice only because of that overlap is one purchase. List it once and count it in overlap_lines_merged.
- Two separate purchases of the same item are two lines even if they look identical. Treat a repeat as overlap only when it sits at the seam between two images and the lines around it repeat too.
- The subtotal, tax, tip, discount and printed total usually appear on the last image. Take each from where it is printed and never add them twice.`

const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), max) : 0)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const MAX_CENTS = 10_000_000
const MAX_ITEMS = 80

/**
 * Check and tidy what the model returned. Returns null when it is not a usable receipt (not a receipt, or no items).
 * Nothing from the model is trusted: numbers are clamped, text is trimmed and unknown labels are dropped.
 */
export function parseScan(raw: unknown): ScanResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.is_receipt !== true || !Array.isArray(r.items)) return null
  const items: ScannedItem[] = []
  for (const x of r.items.slice(0, MAX_ITEMS)) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const name = text(o.name, 60)
    if (!name) continue
    items.push({ name, qty: Math.max(1, int(o.qty, 99)), cents: int(o.total_cents, MAX_CENTS) })
  }
  if (!items.length) return null
  const tax = int(r.tax_cents, MAX_CENTS)
  const tip = int(r.tip_cents, MAX_CENTS)
  const discount = int(r.discount_cents, MAX_CENTS)
  // a missing total is rebuilt from the parts, so the review screen still has something to compare against
  const parts = items.reduce((n, i) => n + i.cents, 0) + tax + tip - discount
  const printed = int(r.total_cents, MAX_CENTS)
  const date = text(r.date, 10)
  const category = text(r.category, 30)
  const hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.filter((h): h is string => (HIDDEN_KINDS as readonly string[]).includes(h as string)))] : []
  return {
    merchant: text(r.merchant, 40),
    location: text(r.location, 60),
    category: (CATEGORY_NAMES as readonly string[]).includes(category) ? category : 'Other',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    items,
    tax,
    tip,
    discount,
    total: printed || Math.max(parts, 0),
    mergedLines: int(r.overlap_lines_merged, MAX_ITEMS),
    hidden,
  }
}
