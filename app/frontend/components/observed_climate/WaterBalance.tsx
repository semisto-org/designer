import clsx from 'clsx'
import { useEffect, useId, useState } from 'react'
import { SectionTitle } from '@/components/climate/CurrentClimate'
import { formatMm } from '@/components/climate/format'
import { HelpButton } from '@/components/help/HelpButton'
import { api } from '@/lib/api'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { pencilPath, washBar } from './model'

/** One month of WaterBalance::Model (mm). */
export type BalanceMonth = {
  month: number
  rainMm: number
  petMm: number
  aetMm: number
  soilMm: number
  surplusMm: number
  deficitMm: number
}

export type Balance = {
  months: BalanceMonth[]
  reserveMm: number
  annual: { rainMm: number; petMm: number; surplusMm: number; deficitMm: number }
  dryMonths: number[]
}

export type WaterBalanceReport =
  | { available: false; reason: string }
  | { available: true; status: 'pending' | 'failed' }
  | {
      available: true
      status: 'ready'
      soil: string
      reserveMm: number
      observed: Balance
      future: (Balance & { horizon: string; scenario: string; warmingC: number; summerRainPct: number }) | null
      storage: {
        areaM2: number
        tanksM3: number
        roofAreaM2: number
        roofSummerM3: number
        worksM3: number
        winterSurplusM3: number
        deficitM3: number
        wateredM2: number | null
      }
    }

const W = 260
const H = 150
const LEFT = 8
const RIGHT = 244
const BOTTOM = 118
const TOP = 10
const SLOT = (RIGHT - LEFT) / 12
// Pond water of the home page time-lapse: the design system has no blue token.
const WATER = '#7fa7c2'
const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'long', timeZone: 'UTC' })
const nameOf = (month: number) => monthName.format(Date.UTC(2001, month - 1, 1))

/** "de juin à août", "en juillet": the span of consecutive months. */
function span(months: number[]): string {
  if (months.length === 1) return t('water_balance.span_one', { month: nameOf(months[0]) })
  return t('water_balance.span', { from: nameOf(months[0]), to: nameOf(months[months.length - 1]) })
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * « Le bilan de l'eau, mois par mois »: rain, what the plant cover gives
 * back to the air and the soil's reserve, today and in 2050, then what the
 * map's tanks, roofs, ponds and swales can do about it. Renders nothing
 * while the observed climate is not available.
 */
export function WaterBalance({ mapId, version }: { mapId: number | string; version?: string | null }) {
  const [report, setReport] = useState<WaterBalanceReport | null>(null)
  const [later, setLater] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      api<WaterBalanceReport>(`/maps/${mapId}/water_balance`, { signal: controller.signal })
        .then((next) => {
          setReport(next)
          if (next.available && next.status === 'pending') timer = setTimeout(load, 15_000)
        })
        .catch(() => undefined)
    }
    load()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [mapId, version])

  if (!report || !report.available || report.status !== 'ready') return null
  const balance = later && report.future ? report.future : report.observed
  const { storage } = report

  return (
    <section aria-labelledby="water-balance" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="water-balance">{t('water_balance.title')}</SectionTitle>
        <HelpButton compact slug="lire-le-relief-et-l-eau" />
      </div>
      <p className="text-sm text-loam-700">{t('water_balance.intro')}</p>

      {report.future && (
        <div className="inline-flex rounded-full bg-loam-100 p-0.5 text-sm" role="group" aria-label={t('water_balance.when')}>
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={later === value}
              onClick={() => setLater(value)}
              className={clsx('rounded-full px-3 py-1', later === value ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600')}
            >
              {value ? t('water_balance.in_year', { year: report.future!.horizon }) : t('water_balance.today')}
            </button>
          ))}
        </div>
      )}

      <BalanceChart balance={balance} />

      <div className="space-y-2 text-sm text-loam-800">
        {balance.annual.surplusMm > 0 && (
          <p>{t('water_balance.surplus', { mm: formatMm(balance.annual.surplusMm), volume: formatNumber(Math.round(storage.areaM2 * balance.annual.surplusMm / 1000)) })}</p>
        )}
        <p>
          {balance.dryMonths.length > 0
            ? capitalize(t('water_balance.deficit', { span: span(balance.dryMonths), mm: formatMm(balance.annual.deficitMm), litres: formatNumber(balance.annual.deficitMm) }))
            : t('water_balance.no_deficit')}
        </p>
        {!later && report.future && (
          <p>
            {t('water_balance.future', {
              year: report.future.horizon,
              warming: formatNumber(report.future.warmingC),
              rain: formatNumber(report.future.summerRainPct),
              mm: formatMm(report.future.annual.deficitMm),
            })}
          </p>
        )}
        <Storage storage={storage} deficitMm={report.observed.annual.deficitMm} />
      </div>
      <p className="text-sm text-loam-500">
        {t('water_balance.note', { reserve: formatMm(report.reserveMm), soil: t(`relief.soils.${report.soil}`).toLowerCase() })}
      </p>
    </section>
  )
}

function Storage({ storage, deficitMm }: { storage: Extract<WaterBalanceReport, { status: 'ready' }>['storage']; deficitMm: number }) {
  const watering = storage.tanksM3 + storage.roofSummerM3
  return (
    <>
      {watering > 0 && storage.wateredM2 != null && deficitMm > 0 && (
        <p>
          {t(storage.roofSummerM3 > 0 ? 'water_balance.watering' : 'water_balance.watering_tanks', {
            tanks: formatNumber(storage.tanksM3),
            roofs: formatNumber(storage.roofSummerM3),
            area: formatArea(storage.wateredM2),
          })}
        </p>
      )}
      {storage.tanksM3 === 0 && storage.roofAreaM2 > 0 && <p>{t('water_balance.no_tank')}</p>}
      {storage.worksM3 > 0 && <p>{t('water_balance.works', { volume: formatNumber(storage.worksM3) })}</p>}
    </>
  )
}

/**
 * Rain as watercolour bars, evapotranspiration as a pencil line, and the
 * months when plants lack water washed in ochre under the line.
 */
function BalanceChart({ balance }: { balance: Balance }) {
  const id = useId().replace(/:/g, '')
  const max = Math.max(100, ...balance.months.flatMap((m) => [m.rainMm, m.petMm]))
  const y = (mm: number) => BOTTOM - (mm / max) * (BOTTOM - TOP)
  const cx = (i: number) => LEFT + SLOT * (i + 0.5)
  const pet = balance.months.map((m, i) => [cx(i), y(m.petMm)] as [number, number])
  const soil = balance.months.map((m, i) => [cx(i), BOTTOM + 4 + (1 - m.soilMm / Math.max(1, balance.reserveMm)) * 8] as [number, number])
  const initials = t('observed_climate.months.initials')

  return (
    <figure className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t('water_balance.chart_label')}>
        <defs>
          <filter id={`pencil-${id}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="2.2" />
          </filter>
          <filter id={`wash-${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" seed="9" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        </defs>

        <g filter={`url(#wash-${id})`}>
          {balance.months.map((m, i) => (
            <g key={m.month}>
              <path d={washBar(cx(i) - SLOT * 0.34, SLOT * 0.68, y(m.rainMm), BOTTOM, i + 1)} fill={WATER} opacity="0.5" />
              {m.deficitMm > 0 && (
                <path d={washBar(cx(i) - SLOT * 0.34, SLOT * 0.68, y(m.petMm), y(m.petMm - m.deficitMm), i + 61)} className="fill-humus-400" opacity="0.55" />
              )}
            </g>
          ))}
        </g>

        <path d={pencilPath(pet, 1, 3)} fill="none" className="stroke-humus-700" strokeWidth="1.6" strokeLinecap="round" filter={`url(#pencil-${id})`} />
        {pet.map(([x, py], i) => <circle key={i} cx={x} cy={py} r="1.6" className="fill-humus-700" />)}

        <path d={pencilPath([[LEFT - 4, BOTTOM + 0.5], [W / 2, BOTTOM + 1], [RIGHT + 4, BOTTOM + 0.3]], 0.6, 5)} fill="none" className="stroke-loam-500" strokeWidth="0.9" />
        {/* The soil reserve under the ground line: lower when it empties. */}
        <path d={pencilPath(soil, 0.6, 11)} fill="none" className="stroke-loam-600" strokeWidth="1.1" strokeDasharray="2 2" />
        {balance.months.map((m, i) => (
          <text key={m.month} x={cx(i)} y={BOTTOM + 26} textAnchor="middle" fontSize="10" className="fill-loam-500">{initials[i]}</text>
        ))}

        {balance.months.map((m, i) => (
          <rect key={m.month} x={LEFT + SLOT * i} y={TOP} width={SLOT} height={BOTTOM - TOP + 28} fill="transparent">
            <title>{t('water_balance.tooltip', { month: nameOf(m.month), rain: formatMm(m.rainMm), pet: formatMm(m.petMm), soil: formatMm(m.soilMm), deficit: formatMm(m.deficitMm) })}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-loam-600">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: WATER, opacity: 0.7 }} aria-hidden />{t('water_balance.legend.rain')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-humus-700" aria-hidden />{t('water_balance.legend.pet')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-humus-400/60" aria-hidden />{t('water_balance.legend.deficit')}</span>
        <span className="inline-flex items-center gap-1"><span className="h-0 w-3 border-t border-dashed border-loam-600" aria-hidden />{t('water_balance.legend.soil')}</span>
      </figcaption>
    </figure>
  )
}
