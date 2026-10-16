import type { IControl, Map as MapLibreMap } from 'maplibre-gl'

// Lucide "scan", inline: this control lives outside React.
const SCAN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>'

/**
 * "Recentrer sur la parcelle": one button under the zoom controls, with its
 * name in a tooltip on hover. `onClick` frames the terrain again.
 */
export class RecenterControl implements IControl {
  private container: HTMLElement | null = null

  constructor(private readonly label: string, private readonly onClick: () => void) {}

  onAdd(_map: MapLibreMap): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group editor-recenter'
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', this.label)
    button.className = 'grid place-items-center text-loam-700'
    button.innerHTML = SCAN_ICON
    button.addEventListener('click', this.onClick)
    const tip = document.createElement('span')
    tip.className = 'editor-recenter-tip'
    tip.setAttribute('aria-hidden', 'true')
    tip.textContent = this.label
    container.append(button, tip)
    this.container = container
    return container
  }

  onRemove(): void {
    this.container?.remove()
    this.container = null
  }
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
// Lucide "camera" and "camera-off", inline for the same reason.
const CAMERA_ICON = svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>')
const CAMERA_OFF_ICON = svg('<line x1="2" x2="22" y1="2" y2="22"/><path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/><path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/><path d="M14.121 15.121A3 3 0 1 1 9.88 10.88"/>')

/**
 * « Photos sur la carte »: one button in the column of map controls that
 * shows or hides the photo markers, with what a click will do in its tooltip.
 * `update` keeps it in step with the choice made elsewhere (« Calques », « Photos »).
 */
export class PhotosToggleControl implements IControl {
  private container: HTMLElement | null = null
  private button: HTMLButtonElement | null = null
  private tip: HTMLElement | null = null

  constructor(private readonly onToggle: () => void) {}

  onAdd(_map: MapLibreMap): HTMLElement {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group editor-recenter editor-photos-toggle'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'grid place-items-center'
    button.addEventListener('click', this.onToggle)
    const tip = document.createElement('span')
    tip.className = 'editor-recenter-tip'
    tip.setAttribute('aria-hidden', 'true')
    container.append(button, tip)
    this.container = container
    this.button = button
    this.tip = tip
    return container
  }

  update(shown: boolean, label: string): void {
    if (!this.button || !this.tip) return
    this.button.innerHTML = shown ? CAMERA_ICON : CAMERA_OFF_ICON
    this.button.setAttribute('aria-pressed', String(shown))
    this.button.setAttribute('aria-label', label)
    this.button.dataset.shown = String(shown)
    this.tip.textContent = label
  }

  onRemove(): void {
    this.container?.remove()
    this.container = this.button = this.tip = null
  }
}
