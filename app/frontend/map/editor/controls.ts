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
