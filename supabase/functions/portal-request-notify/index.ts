import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Emails the owning rep when a customer submits a quote request from a price portal.
// Called by the trigger in supabase_schema.sql with {id}. Deploy with JWT verification OFF.
// Safe to call without auth: it only emails for a real request row, and only once (notified_at).

const SURL        = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY  = Deno.env.get('RESEND_API_KEY')!
const FROM        = Deno.env.get('FROM_EMAIL') || 'FieldIQ <onboarding@resend.dev>'

const sb = createClient(SURL, SERVICE_KEY)

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const id = body.id || body.record?.id
    if (!id) return new Response('no id', { status: 400 })

    // Claim the row: only the first caller gets it, so retries and replays never double-send.
    const { data: claimed } = await sb.from('portal_quote_requests')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', id).is('notified_at', null)
      .select('token,customer_name,items,submitted_at').maybeSingle()
    if (!claimed) return new Response('already handled', { status: 200 })

    const { data: portal } = await sb.from('price_portals')
      .select('user_id,customer_name').eq('token', claimed.token).maybeSingle()
    if (!portal?.user_id) return new Response('portal has no owner yet', { status: 200 })

    const { data: u } = await sb.auth.admin.getUserById(portal.user_id)
    const to = u?.user?.email
    if (!to) return new Response('no owner email', { status: 200 })

    const items: any[] = Array.isArray(claimed.items) ? claimed.items : []
    const total = items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)
    const who = claimed.customer_name || portal.customer_name || 'A customer'
    const rows = items.slice(0, 15).map(i =>
      `<tr><td style="padding:4px 12px 4px 0">${esc(i.name || i.code)}</td><td style="padding:4px 0;text-align:right">${esc(i.qty)} ${esc(i.uom)}</td></tr>`
    ).join('')
    const more = items.length > 15 ? `<p style="color:#64748b">+ ${items.length - 15} more items</p>` : ''

    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px">
      <h2 style="margin:0 0 6px">New quote request</h2>
      <p style="margin:0 0 14px;color:#334155"><strong>${esc(who)}</strong> sent ${items.length} item${items.length === 1 ? '' : 's'} (about $${total.toFixed(2)}) from their pricing portal.</p>
      <table style="border-collapse:collapse;font-size:14px">${rows}</table>${more}
      <p style="margin-top:18px;color:#64748b;font-size:13px">Open FieldIQ and look at the top of your Dashboard to review and turn it into a quote.</p>
    </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject: `New quote request from ${who}`, html }),
    })
    if (!r.ok) {
      // release the claim so a retry can send it
      await sb.from('portal_quote_requests').update({ notified_at: null }).eq('id', id)
      return new Response('resend failed: ' + (await r.text()), { status: 502 })
    }
    return new Response('sent', { status: 200 })
  } catch (e) {
    return new Response('error: ' + (e as Error).message, { status: 500 })
  }
})
