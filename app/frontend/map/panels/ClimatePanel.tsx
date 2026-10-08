import { PenLine, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CurrentClimate } from '@/components/climate/CurrentClimate'
import { Forecast } from '@/components/climate/Forecast'
import { FutureClimate } from '@/components/climate/FutureClimate'
import { PlantChecks } from '@/components/climate/PlantChecks'
import { Sources } from '@/components/climate/Sources'
import { Upsell } from '@/components/climate/Upsell'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import WeatherStationsSection from '@/map/weather_stations/WeatherStationsSection'
import type { ClimateReport, ForecastReport, ProjectionData, Scenario } from '@/types/climate_finance'

/**
 * "Climat": today's hardiness zone and normals, the projected climate in
 * 2050 and 2080, each plant of the map checked against them, and the
 * weather forecast when a forecast provider is configured. Projections and
 * plant checks are paid analyses; the server says what is locked.
 */
export default function ClimatePanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [report, setReport] = useState<ClimateReport | null>(null)
  const [error, setError] = useState(false)
  const [forecast, setForecast] = useState<ForecastReport | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('moderate')

  // Reload when the outline (location) or the plants change.
  const plantsVersion = editor.features.filter((f) => f.properties.layer === 'plants').map((f) => f.properties.id).join(',')
  const load = useCallback((signal?: AbortSignal) => {
    setError(false)
    api<ClimateReport>(`/maps/${mapId}/climate`, { signal })
      .then(setReport)
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(true) })
  }, [mapId])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, editor.map.updatedAt, plantsVersion])

  useEffect(() => {
    if (!report?.capabilities.forecast || !report.location) return
    const controller = new AbortController()
    setForecastLoading(true)
    api<ForecastReport>(`/maps/${mapId}/climate/forecast`, { signal: controller.signal })
      .then(setForecast)
      .catch((e: Error) => { if (e.name !== 'AbortError') setForecast({ available: false, reason: 'upstream_error', supported: true }) })
      .finally(() => setForecastLoading(false))
    return () => controller.abort()
  }, [mapId, report?.capabilities.forecast, report?.location?.lat, report?.location?.lng])

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-clay-700">{t('climate.load_error')}</p>
        <Button variant="secondary" size="sm" onClick={() => load()}><RefreshCw className="h-4 w-4" />{t('climate.retry')}</Button>
      </div>
    )
  }
  if (!report) return <p className="text-sm text-loam-500" aria-busy="true">{t('climate.loading')}</p>

  if (!report.current.available) {
    const noLocation = report.current.reason === 'no_location'
    return (
      <div className="space-y-3">
        <p className="text-sm text-loam-600">{t(`climate.reasons.${report.current.reason}`)}</p>
        {noLocation && editor.canEdit && (
          <Button variant="secondary" size="sm" onClick={() => editor.openPanel('terrain')}>
            <PenLine className="h-4 w-4" />{t('climate.draw_outline')}
          </Button>
        )}
      </div>
    )
  }

  const current = report.current
  const projections = report.projections
  const plants = report.plants
  const locked = 'locked' in projections || 'locked' in plants
  // The references of the scenario on screen, for both horizons.
  const shownProjections = 'available' in projections && projections.available
    ? Object.values(projections.horizons).map((byScenario) => byScenario[scenario]).filter((p): p is ProjectionData => p?.available === true)
    : []

  return (
    <div className="space-y-6">
      <CurrentClimate data={current} />
      {locked && <Upsell plantsCount={plants.count} />}
      {'available' in projections && projections.available && (
        <FutureClimate block={projections} current={current.zone} scenario={scenario} onScenario={setScenario} />
      )}
      {'available' in projections && !projections.available && (
        <p className="text-sm text-loam-600">{t(`climate.reasons.${projections.reason}`)}</p>
      )}
      {'available' in plants && plants.available && <PlantChecks block={plants} scenario={scenario} />}
      <Forecast report={report.capabilities.forecast ? forecast : null} loading={forecastLoading} />
      <WeatherStationsSection />
      <Sources sources={report.sources} note={current.note} current={current} projections={shownProjections} />
    </div>
  )
}
