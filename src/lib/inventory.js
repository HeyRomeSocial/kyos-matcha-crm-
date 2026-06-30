import { supabase } from './supabase'
import toast from 'react-hot-toast'

// Match a line item description to a matcha SKU
// AAA must be checked before A to avoid false matches
export function matchSku(desc) {
  const d = (desc || '').toLowerCase()
  if (d.includes('matcha aaa') || d.includes('aaa')) return 'MATCHA-AAA'
  if (d.includes('matcha a') || (d.includes('matcha') && !d.includes('aaa'))) return 'MATCHA-A'
  return null
}

// Deduct kg from inventory when an invoice is saved
// Only deducts matcha kg line items — skips shipping, pouches, kits
export async function deductInventoryForOrder(order) {
  if (!order?.line_items?.length) return

  const { data: items } = await supabase.from('inventory').select('*')
  if (!items?.length) return

  for (const li of order.line_items) {
    const desc = (li.desc || '').toLowerCase()
    // Skip non-matcha and 50g pouches
    if (!desc.includes('matcha')) continue
    if (desc.includes('50g') || desc.includes('pouch')) continue
    if (desc.includes('starter kit')) continue
    if (desc.includes('shipping')) continue

    const sku = matchSku(li.desc)
    if (!sku) continue

    const item = items.find(i => i.sku === sku)
    if (!item) continue

    const qty = Number(li.qty) || 0
    if (qty <= 0) continue

    const newStock = Number(item.stock_kg) - qty

    await supabase.from('inventory').update({
      stock_kg: Math.max(newStock, 0),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)

    await supabase.from('inventory_transactions').insert({
      inventory_id: item.id,
      order_id: order.id || null,
      type: 'sale',
      qty_change: -qty,
      notes: `Invoice ${order.invoice_number || ''}`,
    })

    if (newStock <= item.low_stock_threshold_kg) {
      toast(`⚠ ${item.name} low — ${Math.max(newStock, 0).toFixed(1)}kg left`, {
        duration: 6000,
        style: { background: '#fef3c7', color: '#92400e' },
      })
    }
  }
}

// Restore inventory when an order is deleted (reverse of deductInventoryForOrder)
export async function restoreInventoryForOrder(order) {
  if (!order?.line_items?.length) return

  const { data: items } = await supabase.from('inventory').select('*')
  if (!items?.length) return

  for (const li of order.line_items) {
    const desc = (li.desc || '').toLowerCase()
    if (!desc.includes('matcha')) continue
    if (desc.includes('50g') || desc.includes('pouch')) continue
    if (desc.includes('starter kit')) continue
    if (desc.includes('shipping')) continue

    const sku = matchSku(li.desc)
    if (!sku) continue

    const item = items.find(i => i.sku === sku)
    if (!item) continue

    const qty = Number(li.qty) || 0
    if (qty <= 0) continue

    await supabase.from('inventory').update({
      stock_kg: Number(item.stock_kg) + qty,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)

    await supabase.from('inventory_transactions').insert({
      inventory_id: item.id,
      order_id: order.id || null,
      type: 'restock',
      qty_change: qty,
      notes: `Deleted invoice ${order.invoice_number || ''}`,
    })
  }
}

// Restock an inventory item
export async function restockInventory(inventoryId, qty, notes = '') {
  const { data: item } = await supabase.from('inventory').select('*').eq('id', inventoryId).single()
  if (!item) return

  const newStock = Number(item.stock_kg) + Number(qty)
  await supabase.from('inventory').update({
    stock_kg: newStock,
    updated_at: new Date().toISOString(),
  }).eq('id', inventoryId)

  await supabase.from('inventory_transactions').insert({
    inventory_id: inventoryId,
    type: 'restock',
    qty_change: Number(qty),
    notes: notes || 'Manual restock',
  })
}

// Set stock to exact value (manual adjustment)
export async function adjustInventory(inventoryId, newQty, notes = '') {
  const { data: item } = await supabase.from('inventory').select('*').eq('id', inventoryId).single()
  if (!item) return

  const diff = Number(newQty) - Number(item.stock_kg)
  await supabase.from('inventory').update({
    stock_kg: Number(newQty),
    updated_at: new Date().toISOString(),
  }).eq('id', inventoryId)

  await supabase.from('inventory_transactions').insert({
    inventory_id: inventoryId,
    type: 'adjustment',
    qty_change: diff,
    notes: notes || 'Manual adjustment',
  })
}
