// Prices are stored in cents, shown the Belgian way: "79 €", "55,30 €".
const whole = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const cents = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatPrice(amountCents: number): string {
  return (amountCents % 100 === 0 ? whole : cents).format(amountCents / 100)
}

// Billing dates are days in Brussels (the app's time zone), wherever the reader is.
const longDate = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', timeZone: 'Europe/Brussels' })

/** "12 octobre 2027" */
export function formatDate(iso: string | Date): string {
  return longDate.format(typeof iso === 'string' ? new Date(iso) : iso)
}

/** An amount in the currency of a payment ("79 €", "55,30 €", "12,00 $"). */
export function formatMoney(amountCents: number, currency = 'EUR'): string {
  if (currency.toUpperCase() === 'EUR') return formatPrice(amountCents)
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: currency.toUpperCase() }).format(amountCents / 100)
}
