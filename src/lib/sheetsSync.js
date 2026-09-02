import { supabase } from './supabase'
import { lineItemKg } from './utils'

export async function syncToSheets() {
  try {
    const { data: settings } = await supabase.from('settings').select('sheets_sync_url').eq('id', 1).single()
    if (!settings?.sheets_sync_url) return

    const [{ data: orders }, { data: partners }] = await Promise.all([
      supabase.from('orders').select('*').order('date', { ascending: false }),
      supabase.from('partners').select('*').order('name'),
    ])

    // Attach pre-calculated kg to each order so Apps Script reads the correct value
    const ordersWithKg = (orders || []).map(o => ({
      ...o,
      total_kg: (o.line_items || []).reduce((sum, li) => sum + lineItemKg(li), 0),
    }))

    fetch(settings.sheets_sync_url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ orders: ordersWithKg, partners: partners || [] }),
    }).catch(() => {})
  } catch {}
}
