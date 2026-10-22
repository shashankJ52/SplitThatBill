import Anthropic from '@anthropic-ai/sdk'
import { RECEIPT_SCHEMA, SCAN_PROMPT } from '../src/scan/receipt'
import { handleScan } from './_handler'

const MODEL = 'claude-haiku-5-5'

/** Vercel function: POST /api/scan with {mime, data (base64)} and a signed-in person's token. */
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
    async read({ mime, data }) {
      const source = { type: 'base64' as const, media_type: mime, data }
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SCAN_PROMPT,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: RECEIPT_SCHEMA as unknown as Record<string, unknown> } },
        messages: [
          {
            role: 'user',
            content: [
              mime === 'application/pdf'
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
                : { type: 'image', source: source as { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } },
              { type: 'text', text: 'Read this receipt.' },
            ],
          },
        ],
      })
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error(res.stop_reason)
      const block = res.content.find((b) => b.type === 'text')
      if (!block || block.type !== 'text') throw new Error('no text')
      return JSON.parse(block.text)
    },
  })
}
