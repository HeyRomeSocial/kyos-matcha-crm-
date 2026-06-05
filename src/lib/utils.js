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

export function getOrderStatus(order) {
  if (order.status === 'paid') return 'paid'
  const days = differenceInDays(new Date(), parseISO(order.date))
  if (days > 14) return 'overdue'
  return 'unpaid'
}
