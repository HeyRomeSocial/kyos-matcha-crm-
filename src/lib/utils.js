import { format, parseISO, differenceInDays, addDays } from 'date-fns'

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount || 0)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'd MMM yyyy')
  } catch {
    return dateStr
  }
}

export function calcNextOrder(lastOrderDate, frequencyDays) {
  if (!lastOrderDate || !frequencyDays) return null
  const d = addDays(parseISO(lastOrderDate), frequencyDays)
  return format(d, 'yyyy-MM-dd')
}

export function reorderUrgency(nextExpectedOrder) {
  if (!nextExpectedOrder) return null
  const days = differenceInDays(parseISO(nextExpectedOrder), new Date())
  if (days < 0) return 'overdue'
  if (days <= 7) return 'soon'
  if (days <= 14) return 'upcoming'
  return null
}

// Returns the kg of matcha represented by a single line item.
// Retail pouches are 50g each; all other matcha lines are qty = kg.
// Starter kits and non-matcha lines contribute 0 kg.
export function lineItemKg(li) {
  const desc = (li.desc || '').toLowerCase()
  // Tins — count by their actual weight, not qty-as-kg
  if (desc.includes('tin 30g') || desc.includes('30g ceremonial')) return (Number(li.qty) || 0) * 0.03
  if (desc.includes('tin 50g')) return (Number(li.qty) || 0) * 0.05
  if (desc.includes('tin 100g')) return (Number(li.qty) || 0) * 0.1
  // Retail pouches = 50g each
  if (desc.includes('50g') || desc.includes('retail pouch') || (desc.includes('pouch') && !desc.includes('matcha')))
    return (Number(li.qty) || 0) * 0.05
  // Starter kit, whisk, shelf, shipping = no matcha kg
  if (desc.includes('starter kit') || desc.includes('whisk') || desc.includes('shelf') || desc.includes('shipping'))
    return 0
  // Bulk matcha lines — qty is in kg
  if (desc.includes('matcha')) return Number(li.qty) || 0
  return 0
}

export function getOrderStatus(order) {
  if (order.status === 'paid') return 'paid'
  // If snoozed until a future date, treat as pending regardless of age
  if (order.snoozed_until && order.snoozed_until >= format(new Date(), 'yyyy-MM-dd')) return 'unpaid'
  const days = differenceInDays(new Date(), parseISO(order.date))
  if (days > 14) return 'overdue'
  return 'unpaid'
}
