import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getValidAccessToken(supabase: any, clientId: string, clientSecret: string) {
  const { data: tokenRow } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('id', 1)
    .single()

  if (!tokenRow) throw new Error('Gmail not connected')

  // Refresh if expired or expiring within 5 mins
  if (new Date(tokenRow.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const refreshed = await res.json()
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase.from('gmail_tokens').update({
      access_token: refreshed.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    return refreshed.access_token
  }

  return tokenRow.access_token
}

function decodeEmailBody(payload: any): string {
  const findBody = (part: any): string => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    }
    if (part.parts) {
      for (const p of part.parts) {
        const result = findBody(p)
        if (result) return result
      }
    }
    return ''
  }
  return findBody(payload)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)

    // Only pull inbound emails (not sent by us, not automated/noreply)
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:30d in:inbox -from:me -from:noreply -from:no-reply',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const listData = await listRes.json()
    const messages = listData.messages || []

    if (messages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get already-processed email IDs
    const { data: existing } = await supabase
      .from('order_inbox')
      .select('email_id')
    const existingIds = new Set((existing || []).map((r: any) => r.email_id))

    const newMessages = messages.filter((m: any) => !existingIds.has(m.id))

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    let processed = 0

    for (const msg of newMessages) {
      // Fetch full message
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const msgData = await msgRes.json()

      const headers = msgData.payload?.headers || []
      const from = headers.find((h: any) => h.name === 'From')?.value || ''
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
      const dateStr = headers.find((h: any) => h.name === 'Date')?.value || ''
      const body = decodeEmailBody(msgData.payload)

      if (!body.trim()) continue

      // Parse with Claude Haiku
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are helping a UK matcha wholesaler identify new inbound order requests from café partners.

Email From: ${from}
Subject: ${subject}
Body: ${body}

Respond with this exact JSON format (use null if info not found):
{
  "is_order": true or false,
  "partner_name": "cafe/business name",
  "product": "product name e.g. Ceremonial Grade Matcha",
  "quantity_kg": number or null,
  "notes": "any special requests or delivery notes"
}

Rules:
- Set is_order to TRUE only if this is a NEW inbound order request from a partner placing an order (e.g. "can we get 2kg", "we'd like to reorder", "please send us X kg")
- Set is_order to FALSE if this is: a reply to an existing conversation, a thank you, a general enquiry, a delivery confirmation, an invoice, a marketing email, or anything that is NOT a new order request
- The email must be FROM a partner TO Kyos Matcha — not the other way around`
        }]
      })

      let parsed: any = {}
      try {
        const text = response.content[0].type === 'text' ? response.content[0].text : ''
        parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}')
      } catch {
        continue
      }

      if (!parsed.is_order) continue

      // Extract email address from "Name <email>" format
      const emailMatch = from.match(/<(.+?)>/)
      const fromEmail = emailMatch ? emailMatch[1] : from
      const fromName = emailMatch ? from.replace(/<.+?>/, '').trim() : from

      await supabase.from('order_inbox').insert({
        email_id: msg.id,
        received_at: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
        from_email: fromEmail,
        from_name: fromName || parsed.partner_name,
        subject,
        raw_body: body.slice(0, 2000),
        parsed_partner: parsed.partner_name,
        parsed_product: parsed.product,
        parsed_quantity_kg: parsed.quantity_kg,
        parsed_notes: parsed.notes,
        status: 'pending',
      })

      processed++
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
