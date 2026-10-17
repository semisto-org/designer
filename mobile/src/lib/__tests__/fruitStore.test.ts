import { measuresSomething, parseMeasure, storageAdvice, storageReadingBody } from '../fruitStore'

describe('fruit store readings', () => {
  it('reads French decimals and leaves empty fields out', () => {
    expect(parseMeasure('18,5')).toBe(18.5)
    expect(parseMeasure(' 72 ')).toBe(72)
    expect(parseMeasure('')).toBeNull()
    expect(parseMeasure('abc')).toBeNull()
  })

  it('needs at least one measure, and sends the server its keys', () => {
    const reading = { measuredOn: '2026-10-03', temperatureC: 18, temperatureMinC: null, temperatureMaxC: null, humidityPct: 70, note: null }
    expect(measuresSomething(reading)).toBe(true)
    expect(measuresSomething({ ...reading, temperatureC: null, humidityPct: null })).toBe(false)
    expect(storageReadingBody(reading).storage_reading).toMatchObject({ measured_on: '2026-10-03', temperature_c: 18, humidity_pct: 70 })
  })

  it('turns the verdict into advice', () => {
    expect(storageAdvice({ temperature: { status: 'bad', side: 'warm' }, humidity: { status: 'bad', side: 'dry' }, overall: 'bad' })).toEqual(['warm_bad', 'dry_bad'])
    expect(storageAdvice({ temperature: { status: 'frost', side: 'cold' }, humidity: { status: 'fair', side: 'wet' }, overall: 'frost' })).toEqual(['frost', 'wet'])
    expect(storageAdvice(null)).toEqual([])
  })
})
