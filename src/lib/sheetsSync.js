import { supabase } from './supabase'

export async function syncToSheets() {
  try {
    // Get the webhook URL from settings
    const { data: settings } = await supabase.from('settings').select('sheets_sync_url').eq('id', 1).single()
    if (!settings?.sheets_sync_url) return

    // Fetch all orders and partners
    const [{ data: orders }, { data: partners }] = await Promise.all([
      supabase.from('orders').select('*').order('date', { ascending: false }),
      supabase.from('partners').select('*').order('name'),
    ])

    // Fire and forget — no-cors since Apps Script doesn't return CORS headers
    fetch(settings.sheets_sync_url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ orders: orders || [], partners: partners || [] }),
    }).catch(() => {})
  } catch {}
}
