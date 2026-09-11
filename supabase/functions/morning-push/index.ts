import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = 'mailto:appiqsupport@gmail.com'
const SURL              = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── helpers ──────────────────────────────────────────────────────────────────

function b64uDec(s: string): Uint8Array {
  while (s.length % 4) s += '='
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new Uint8Array(bin.length).map((_, i) => bin.charCodeAt(i))
}
function b64uEnc(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────────────────────

async function vapidAuth(endpoint: string): Promise<string> {
  const { protocol, host } = new URL(endpoint)
  const audience = `${protocol}//${host}`
  const now = Math.floor(Date.now() / 1000)

  const hdr = b64uEnc(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const pay = b64uEnc(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })))
  const msg = new TextEncoder().encode(`${hdr}.${pay}`)

  // Public key: 65-byte uncompressed point → x, y
  const pub = b64uDec(VAPID_PUBLIC_KEY)
  const x   = b64uEnc(pub.slice(1, 33))
  const y   = b64uEnc(pub.slice(33, 65))
  const d   = VAPID_PRIVATE_KEY

  const key = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', d, x, y, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, msg)
  return `vapid t=${hdr}.${pay}.${b64uEnc(sig)},k=${VAPID_PUBLIC_KEY}`
}

// ── Web Push payload encryption (RFC 8291 / aes128gcm) ───────────────────────

async function encryptPayload(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string
): Promise<Uint8Array> {
  const enc  = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const uaPub    = b64uDec(sub.keys.p256dh) // 65-byte uncompressed point
  const authSec  = b64uDec(sub.keys.auth)   // 16 bytes

  // Ephemeral EC key pair
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  ) as CryptoKeyPair

  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  )

  // ECDH shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, eph.privateKey, 256
  )

  // PRK via HKDF (auth_secret as salt, "WebPush: info\0" + uaPub + ephPub as info)
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits'])
  const info    = new Uint8Array([...enc.encode('WebPush: info\x00'), ...uaPub, ...ephPub])
  const prkBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSec, info }, hkdfKey, 256
  )

  const prkKey = await crypto.subtle.importKey('raw', prkBits, 'HKDF', false, ['deriveBits'])

  // CEK (16 bytes) and nonce (12 bytes)
  const cekBytes = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\x00') },
    prkKey, 128
  ))
  const nonceBytes = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\x00') },
    prkKey, 96
  ))

  // AES-128-GCM encrypt (payload + 0x02 delimiter)
  const plaintext = new Uint8Array([...enc.encode(body), 0x02])
  const aesKey    = await crypto.subtle.importKey('raw', cekBytes, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBytes, tagLength: 128 }, aesKey, plaintext
  ))

  // aes128gcm content-coding header: salt(16) + rs(4 BE) + idlen(1) + ephPub(65)
  const rs = 4096
  const out = new Uint8Array(16 + 4 + 1 + ephPub.length + ciphertext.length)
  let i = 0
  out.set(salt, i);            i += 16
  out[i++] = (rs >> 24) & 0xff
  out[i++] = (rs >> 16) & 0xff
  out[i++] = (rs >>  8) & 0xff
  out[i++] =  rs        & 0xff
  out[i++] = ephPub.length
  out.set(ephPub, i);          i += ephPub.length
  out.set(ciphertext, i)
  return out
}

// ── Send one push ─────────────────────────────────────────────────────────────

async function sendPush(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  title: string, body: string
): Promise<boolean> {
  const payload   = JSON.stringify({ title, body })
  const [auth, encrypted] = await Promise.all([vapidAuth(sub.endpoint), encryptPayload(sub, payload)])

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    auth,
      'Content-Type':     'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL':              '86400',
    },
    body: encrypted,
  })
  return res.ok || res.status === 201
}

// ── Morning brief builder ─────────────────────────────────────────────────────

function buildMessage(ST: Record<string, any>): { title: string; body: string } {
  const today    = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const tierDays: Record<string, number> = { A: 7, B: 14, C: 30, D: 60 }

  const customers: any[] = ST.addedCustomers || []
  let overdue = 0, followups = 0, callbacks = 0

  for (const c of customers) {
    if (!c.tier) continue
    const visits: any[] = ST.visits?.[c.code] || []
    let lastGood: Date | null = null
    for (let i = visits.length - 1; i >= 0; i--) {
      if (visits[i].type === 'visited') { lastGood = new Date(visits[i].date); break }
    }
    const target    = ST.tierCadence?.[c.tier] ?? tierDays[c.tier] ?? 30
    const daysSince = lastGood ? Math.floor((today.getTime() - lastGood.getTime()) / 86_400_000) : 9999
    if (daysSince >= target) overdue++

    const sched = ST.scheduled?.[c.code]
    if (sched && (sched.date ?? sched) === todayStr) followups++

    const cb = ST.followups?.[c.code]
    if (cb && new Date(cb).toISOString().split('T')[0] === todayStr) callbacks++
  }

  const name  = ST.userProfile?.name?.split(' ')[0] || 'there'
  const parts: string[] = []
  if (overdue   > 0) parts.push(`${overdue} overdue`)
  if (followups > 0) parts.push(`${followups} follow-up${followups > 1 ? 's' : ''}`)
  if (callbacks > 0) parts.push(`${callbacks} callback${callbacks > 1 ? 's' : ''}`)

  return {
    title: `FieldIQ — Good morning, ${name}`,
    body:  parts.length ? parts.join(' · ') + ' due today' : "You're all caught up — great day out there!",
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const supabase = createClient(SURL, SERVICE_KEY)

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription')

  if (subErr) return new Response(JSON.stringify({ error: subErr.message }), { status: 500 })
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  let sent = 0, failed = 0
  for (const row of subs) {
    try {
      const { data: stateRow } = await supabase
        .from('hc_state')
        .select('state_json')
        .eq('id', row.user_id)
        .single()

      if (!stateRow?.state_json) continue

      const { title, body } = buildMessage(stateRow.state_json)
      const ok = await sendPush(row.subscription, title, body)
      if (ok) sent++; else failed++
    } catch (e) {
      console.error('push failed', row.user_id, e)
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
