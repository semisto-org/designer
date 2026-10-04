import { t } from '@/lib/i18n'
import { MONTH_KEYS } from '@/components/plants/format'

type Row = { key: string; label: string; months: number[]; color: string }

/** Twelve columns, one line per activity (floraison, récolte, taille…). */
export function MonthsCalendar({ rows }: { rows: Row[] }) {
  const visible = rows.filter((row) => row.months.length > 0)
  if (visible.length === 0) return <p className="text-sm text-loam-400">{t('plants.show.no_value')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] table-fixed border-separate border-spacing-x-0.5 border-spacing-y-1 text-xs">
        <thead>
          <tr>
            <th className="w-20 text-left font-normal text-loam-400 sm:w-24"><span className="sr-only">{t('plants.show.calendar_legend')}</span></th>
            {MONTH_KEYS.map((key) => (
              <th key={key} className="font-normal text-loam-400" title={t(`plants.vocabulary.months.${key}`)}>
                <span className="sm:hidden">{t(`plants.vocabulary.months_initial.${key}`)}</span>
                <span className="hidden sm:inline">{t(`plants.vocabulary.months_short.${key}`)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="pr-2 text-left font-medium text-loam-600">{row.label}</th>
              {MONTH_KEYS.map((key, i) => {
                const on = row.months.includes(i + 1)
                return (
                  <td key={key} className="h-5 rounded" style={{ background: on ? row.color : 'var(--color-loam-100)' }}>
                    <span className="sr-only">{on ? t(`plants.vocabulary.months.${key}`) : ''}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
