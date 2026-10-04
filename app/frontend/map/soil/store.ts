import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import type {
  Abundance, BioObservation, BioObservationsResponse, CatalogPlant, IndicatorTally, SoilFieldSpec, SoilResultKey,
  SoilSampleData, SoilSamplesResponse, SuggestedPoint, SuggestionsResponse,
} from '@/types/soil_photos'

/** What the user typed for a plant before it has a position. */
export type ObservationDraft = {
  speciesName: string
  latinName: string | null
  catalogKey: string | null
  plantSpeciesId: number | null
  abundance: Abundance
  notes: string
}

/** What the next click on the map will do. */
export type SoilPlacing =
  | { kind: 'new-sample' }
  | { kind: 'sample'; id: number }
  | { kind: 'observation'; id: number }
  | { kind: 'new-observation'; draft: ObservationDraft }

export type SamplePayload = {
  label: string
  status: 'planned' | 'sampled'
  sampled_on: string | null
  depth_from_cm: number | string
  depth_to_cm: number | string
  lab: string
  lab_reference: string
  notes: string
  results: Partial<Record<SoilResultKey, string>>
  lng?: number
  lat?: number
}

/**
 * Soil points and plant observations of the open map. Shared by the « Sol »
 * panel and the overlay (markers, placing): they live in different parts of
 * the editor and cannot share React state. One map is open at a time.
 */
export type SoilState = {
  mapId: number | null
  samples: SoilSampleData[]
  /** Whether the owner's plan includes the reading of results. */
  analyses: boolean
  fields: SoilFieldSpec[]
  bands: SoilSamplesResponse['bands']
  provenance: string
  loaded: boolean
  loading: boolean
  error: string | null

  observations: BioObservation[]
  summary: IndicatorTally[]
  catalog: CatalogPlant[]
  plantCatalog: boolean
  observationsLoaded: boolean

  /** Suggested positions waiting for the user's choice (drawn on the map, not saved). */
  suggestions: SuggestedPoint[] | null
  /** What the suggestions were computed from, to explain them. */
  suggestionMeta: { wanted: number; usableAreaM2: number; edgeMargin: number; obstacleMargin: number } | null
  /** Point open in the « Points » tab. */
  openId: number | null
  placing: SoilPlacing | null
  showOnMap: boolean
  /**
   * Tab of the panel. Kept here so it survives the panel being folded away
   * (placing on a phone) and so the overlay can open « Points » when a marker is clicked.
   * Null until chosen: the panel then starts on « Points » when there are points, else the guide.
   */
  tab: SoilTab | null
}

export type SoilTab = 'guide' | 'points' | 'compare' | 'plants'

let state: SoilState = {
  mapId: null, samples: [], analyses: false, fields: [], bands: null, provenance: '', loaded: false, loading: false, error: null,
  observations: [], summary: [], catalog: [], plantCatalog: false, observationsLoaded: false,
  suggestions: null, suggestionMeta: null, openId: null, placing: null, showOnMap: readShowOnMap(), tab: null,
}
const listeners = new Set<() => void>()

function readShowOnMap(): boolean {
  try {
    return window.localStorage.getItem('designer.soil.showOnMap') !== 'false'
  } catch {
    return true
  }
}

function set(patch: Partial<SoilState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSoil = (): SoilState => useSyncExternalStore(subscribe, () => state)
export const getSoilState = (): SoilState => state

const byId = (a: { id: number }, b: { id: number }) => a.id - b.id

export const soilActions = {
  /** Loads the points of a map (once; `force` reloads). */
  async load(mapId: number, force = false) {
    if (state.mapId === mapId && (state.loaded || state.loading) && !force) return
    if (state.mapId !== mapId) {
      set({
        mapId, samples: [], loaded: false, observations: [], summary: [], observationsLoaded: false,
        suggestions: null, suggestionMeta: null, openId: null, placing: null,
      })
    }
    set({ loading: true, error: null })
    try {
      const data = await api<SoilSamplesResponse>(`/maps/${mapId}/soil_samples`)
      if (state.mapId !== mapId) return
      set({
        samples: data.samples, analyses: data.analyses, fields: data.fields, bands: data.bands, provenance: data.provenance,
        loaded: true, loading: false,
      })
    } catch (error) {
      set({ loading: false, error: (error as Error).message })
    }
  },

  async loadObservations(mapId: number) {
    try {
      const data = await api<BioObservationsResponse>(`/maps/${mapId}/bioindicator_observations`)
      if (state.mapId !== mapId) return
      set({
        observations: data.observations, summary: data.summary, catalog: data.catalog, plantCatalog: data.plantCatalog,
        observationsLoaded: true,
      })
    } catch {
      // The plants tab shows its empty state; the points keep working.
      set({ observationsLoaded: true })
    }
  },

  // --- points ---

  upsertSample(sample: SoilSampleData) {
    set({ samples: [...state.samples.filter((s) => s.id !== sample.id), sample].sort(byId) })
  },

  async saveSample(mapId: number, id: number, payload: Partial<SamplePayload>): Promise<SoilSampleData> {
    const saved = await api<SoilSampleData>(`/maps/${mapId}/soil_samples/${id}`, { method: 'PATCH', body: { soil_sample: payload } })
    soilActions.upsertSample(saved)
    return saved
  },

  async createSample(mapId: number, payload: Partial<SamplePayload>): Promise<SoilSampleData> {
    const saved = await api<SoilSampleData>(`/maps/${mapId}/soil_samples`, { method: 'POST', body: { soil_sample: payload } })
    soilActions.upsertSample(saved)
    return saved
  },

  async deleteSample(mapId: number, id: number) {
    await api(`/maps/${mapId}/soil_samples/${id}`, { method: 'DELETE' })
    set({ samples: state.samples.filter((s) => s.id !== id), openId: state.openId === id ? null : state.openId })
  },

  async attachReport(mapId: number, id: number, file: File): Promise<SoilSampleData> {
    const form = new FormData()
    form.append('soil_sample[lab_report]', file)
    const saved = await api<SoilSampleData>(`/maps/${mapId}/soil_samples/${id}/report`, { method: 'POST', body: form })
    soilActions.upsertSample(saved)
    return saved
  },

  async removeReport(mapId: number, id: number): Promise<SoilSampleData> {
    const saved = await api<SoilSampleData>(`/maps/${mapId}/soil_samples/${id}/report`, { method: 'DELETE' })
    soilActions.upsertSample(saved)
    return saved
  },

  // --- suggested positions ---

  async suggest(mapId: number, count: number): Promise<SuggestionsResponse> {
    const data = await api<SuggestionsResponse>(`/maps/${mapId}/soil_samples/suggestions`, { method: 'POST', body: { count } })
    set({
      suggestions: data.points,
      suggestionMeta: { wanted: count, usableAreaM2: data.usableAreaM2, edgeMargin: data.edgeMargin, obstacleMargin: data.obstacleMargin },
    })
    return data
  },

  clearSuggestions() {
    set({ suggestions: null, suggestionMeta: null })
  },

  /** Turns the suggested positions into planned points. */
  async acceptSuggestions(mapId: number): Promise<SoilSampleData[]> {
    const points = state.suggestions ?? []
    if (points.length === 0) return []
    const data = await api<{ samples: SoilSampleData[] }>(`/maps/${mapId}/soil_samples/bulk`, {
      method: 'POST', body: { points: points.map(({ lng, lat }) => ({ lng, lat })) },
    })
    set({ samples: [...state.samples, ...data.samples].sort(byId), suggestions: null, suggestionMeta: null })
    return data.samples
  },

  openSample(id: number | null) {
    set({ openId: id })
  },

  // --- plants ---

  async saveObservation(mapId: number, draft: ObservationDraft, position: { lng: number; lat: number } | null): Promise<BioObservation> {
    const saved = await api<BioObservation>(`/maps/${mapId}/bioindicator_observations`, {
      method: 'POST',
      body: {
        bioindicator_observation: {
          species_name: draft.speciesName, latin_name: draft.latinName, catalog_key: draft.catalogKey,
          plant_species_id: draft.plantSpeciesId, abundance: draft.abundance, notes: draft.notes || null,
          ...(position ?? {}),
        },
      },
    })
    await soilActions.loadObservations(mapId)
    return saved
  },

  async patchObservation(mapId: number, id: number, patch: Record<string, unknown>): Promise<BioObservation> {
    const saved = await api<BioObservation>(`/maps/${mapId}/bioindicator_observations/${id}`, {
      method: 'PATCH', body: { bioindicator_observation: patch },
    })
    await soilActions.loadObservations(mapId)
    return saved
  },

  async deleteObservation(mapId: number, id: number) {
    await api(`/maps/${mapId}/bioindicator_observations/${id}`, { method: 'DELETE' })
    set({ observations: state.observations.filter((o) => o.id !== id) })
    await soilActions.loadObservations(mapId)
  },

  // --- UI ---

  startPlacing(placing: SoilPlacing) {
    set({ placing })
  },

  cancelPlacing() {
    set({ placing: null })
  },

  setTab(tab: SoilTab) {
    set({ tab })
  },

  setShowOnMap(value: boolean) {
    try {
      window.localStorage.setItem('designer.soil.showOnMap', String(value))
    } catch {
      // Private mode: the choice just does not persist.
    }
    set({ showOnMap: value })
  },
}
