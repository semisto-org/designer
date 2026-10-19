import { dayList, formatTemp, weekOf, type WeekReport } from '../week'

const day = (date: string, tminC: number, tmaxC = 10) => ({ date, weatherCode: 1, tmaxC, tminC, precipMm: 0, precipProbabilityPct: 10, windGustsKmh: 20 })

const report = (over: Partial<WeekReport> = {}): WeekReport => ({
  today: '2026-10-20',
  forecast: {
    available: true, supported: true, fetchedAt: '2026-10-20T06:00:00Z',
    days: [day('2026-10-19', -3), day('2026-10-20', 4), day('2026-10-21', -1.8), day('2026-10-22', -0.5)],
    alerts: [{ kind: 'frost', dates: ['2026-10-19', '2026-10-21', '2026-10-22'], minC: -3, plants: [{ name: 'Citronnier', coldLimitC: -1 }] }],
    attribution: { name: 'MET Norway', url: 'https://api.met.no', licence: 'CC BY 4.0' },
  },
  season: { month: 10, title: 'Octobre', body: '…' },
  plants: { flowering: { names: [], count: 0 }, harvest: { names: ['Pommier', 'Noisetier'], count: 5 }, pruning: { names: [], count: 0 } },
  tasks: [],
  ...over,
})

describe('weekOf', () => {
  it('keeps the frost still ahead, with its coldest night', () => {
    const week = weekOf(report())
    expect(week.frost?.dates).toEqual(['2026-10-21', '2026-10-22'])
    expect(week.frost?.minC).toBe(-1.8)
    expect(week.frost?.plants).toEqual([{ name: 'Citronnier', coldLimitC: -1 }])
    expect(week.days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    expect(week.attribution).toBe('MET Norway (CC BY 4.0)')
  })

  it('drops a frost that is past', () => {
    expect(weekOf(report(), '2026-10-23').frost).toBeNull()
  })

  it('lists what the plants do this month, with how many more', () => {
    expect(weekOf(report()).plants).toEqual([{ key: 'harvest', names: ['Pommier', 'Noisetier'], more: 3 }])
  })

  it('stays quiet without a forecast, plants or tasks', () => {
    const quiet = weekOf(report({
      forecast: { available: false, reason: 'not_configured', supported: false },
      plants: { flowering: { names: [], count: 0 }, harvest: { names: [], count: 0 }, pruning: { names: [], count: 0 } },
    }))
    expect(quiet.empty).toBe(true)
    expect(quiet.frost).toBeNull()
  })
})

describe('formatting', () => {
  it('writes temperatures the French way, with a real minus sign', () => {
    expect(formatTemp(-1.84)).toBe('−1,8 °C')
    expect(formatTemp(12)).toBe('12 °C')
  })

  it('names the days of an alert', () => {
    expect(dayList(['2026-10-22'])).toBe('jeudi')
    expect(dayList(['2026-10-21', '2026-10-22', '2026-10-23'])).toBe('mercredi, jeudi et vendredi')
  })
})
