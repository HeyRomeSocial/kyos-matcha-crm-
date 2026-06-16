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
  // Any 50g item (retail pouches, resale pouches) = 0.05 kg each
  if (desc.includes('50g') || desc.includes('retail pouch') || (desc.includes('pouch') && !desc.includes('matcha')))
    return (Number(li.qty) || 0) * 0.05
  if (desc.includes('matcha')) return Number(li.qty) || 0
  return 0
}

export function getOrderStatus(order) {
  if (order.status === 'paid') return 'paid'
  const days = differenceInDays(new Date(), parseISO(order.date))
  if (days > 14) return 'overdue'
  return 'unpaid'
}
