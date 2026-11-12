import Anthropic from '@anthropic-ai/sdk'
import { multiPageNote, RECEIPT_SCHEMA, SCAN_PROMPT } from '../src/scan/receipt.js'
import { handleScan } from './_handler.js'

const MODEL = 'claude-haiku-5-5'

/** Health check: says whether scanning is set up, without revealing anything. */
export function GET(): Response {
  const ready = Boolean(process.env.ANTHROPIC_API_KEY && (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL) && (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY))
  return Response.json({ ready }, { headers: { 'cache-control': 'no-store' } })
}

/** Vercel function: POST /api/scan with {pages: [{mime, data (base64)}]} (one to six photos of one receipt) and a signed-in person's token. */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: 'unavailable', message: 'Scanning is not set up yet. You can enter the items yourself.' }, { status: 503 })
  }
  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 })
  return handleScan(request, {
    supabaseUrl,
    supabaseKey,
    fetch,
    async read(pages) {
      const image = (p: { mime: string; data: string }) =>
        p.mime === 'application/pdf'
          ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data } } as const)
          : ({ type: 'image', source: { type: 'base64', media_type: p.mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: p.data } } as const)
      // several pages are labelled in order so the reader knows which comes first; one page is sent as before
      const content = pages.length > 1 ? pages.flatMap((p, i) => [{ type: 'text' as const, text: `Image ${i + 1} of ${pages.length}:` }, image(p)]) : [image(pages[0])]
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: pages.length > 1 ? `${SCAN_PROMPT}\n\n${multiPageNote(pages.length)}` : SCAN_PROMPT,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: RECEIPT_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: 'user', content: [...content, { type: 'text', text: pages.length > 1 ? `Read these ${pages.length} images as one receipt.` : 'Read this receipt.' }] }],
      })
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error(res.stop_reason)
      const block = res.content.find((b) => b.type === 'text')
      if (!block || block.type !== 'text') throw new Error('no text')
      return JSON.parse(block.text)
    },
  })
}
