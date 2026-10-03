import type { Geometry } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  TerraDraw,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
} from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'

export type DrawShape = 'polygon' | 'linestring' | 'point' | 'rectangle' | 'freehand'

const COLOR = '#5b5781'

/**
 * One Terra Draw instance per map, used as a "draw one shape and give it
 * back" service: `draw('polygon')` resolves with the finished geometry, or
 * null when cancelled (Escape or `cancel()`).
 */
export class Drawer {
  private terra: TerraDraw
  private pending: { resolve: (g: Geometry | null) => void } | null = null

  constructor(map: MapLibreMap) {
    const styles = {
      fillColor: COLOR as `#${string}`,
      outlineColor: COLOR as `#${string}`,
      fillOpacity: 0.25,
      outlineWidth: 2,
    }
    this.terra = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode({ styles }),
        new TerraDrawRectangleMode({ styles }),
        new TerraDrawFreehandMode({ styles }),
        new TerraDrawLineStringMode({ styles: { lineStringColor: COLOR, lineStringWidth: 3 } }),
        new TerraDrawPointMode({ styles: { pointColor: COLOR, pointWidth: 7, pointOutlineColor: '#ffffff', pointOutlineWidth: 2 } }),
      ],
    })
    this.terra.on('finish', (id) => {
      const feature = this.terra.getSnapshotFeature(id)
      this.finish(feature ? (feature.geometry as Geometry) : null)
    })
    window.addEventListener('keydown', this.onKey)
  }

  get active() {
    return this.pending !== null
  }

  draw(shape: DrawShape): Promise<Geometry | null> {
    this.finish(null)
    if (!this.terra.enabled) this.terra.start()
    this.terra.setMode(shape)
    return new Promise((resolve) => {
      this.pending = { resolve }
    })
  }

  cancel() {
    this.finish(null)
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey)
    this.finish(null)
    if (this.terra.enabled) this.terra.stop()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.pending) this.cancel()
  }

  private finish(geometry: Geometry | null) {
    const pending = this.pending
    this.pending = null
    if (this.terra.enabled) {
      this.terra.clear()
      this.terra.stop()
    }
    pending?.resolve(geometry)
  }
}
