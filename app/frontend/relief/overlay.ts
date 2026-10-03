// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// What is drawn ON the terrain, in a canvas the scene uses as a texture:
// flow axes and depressions at the grid's resolution, then the map's
// features (and its boundary) as vectors on top.

import type { Feature, Geometry, Position } from 'geojson'
import { axisColor } from './colors.ts'
import type { Drainage } from './hydro.ts'
import { toMercator, type GridMeta } from './grid.ts'

export type OverlayOptions = {
  axes: boolean
  hollows: boolean
  features: boolean
}

/**
 * A cell drains a flow axis from this many m². Claudy used 0.2 ha on a
 * 15 ha estate; a small garden's grid gets a lower threshold so its axes
 * still show (a 60th of the grid's area, between 200 m² and 0.2 ha).
 */
export function axisThreshold(meta: GridMeta): number {
  const area = meta.cols * meta.rows * meta.cellSizeM * meta.cellSizeM
  return Math.max(200, Math.min(2000, area / 60))
}

/** Flow axes and depressions as an RGBA image at the grid's resolution. */
export function drainageImage(drainage: Pick<Drainage, 'accumulation' | 'depression'>, meta: GridMeta, options: Pick<OverlayOptions, 'axes' | 'hollows'>): ImageData {
  const { cols, rows } = meta
  const image = new ImageData(cols, rows)
  const data = image.data
  const { accumulation, depression } = drainage
  const threshold = axisThreshold(meta)
  let accMax = threshold
  for (const a of accumulation) if (a > accMax) accMax = a
  const logMin = Math.log10(threshold)
  const logSpan = Math.max(0.1, Math.log10(accMax) - logMin)
  for (let i = 0; i < accumulation.length; i++) {
    const o = i * 4
    if (options.axes && accumulation[i] >= threshold) {
      const [r, g, b, a] = axisColor(Math.min(1, (Math.log10(accumulation[i]) - logMin) / logSpan))
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = a
    } else if (options.hollows && depression[i] > 0.05) {
      data[o] = 14
      data[o + 1] = 165
      data[o + 2] = 233
      data[o + 3] = 70 + 110 * Math.min(1, depression[i] / 1.5)
    }
  }
  return image
}

export type OverlayFeature = Feature<Geometry, { color?: unknown; layer?: string; kind?: string; style?: Record<string, unknown> | null } | null>

/**
 * Draw the overlay: drainage raster (scaled to the canvas), the map's
 * features, and the boundary on top (white casing, prune dashes).
 */
export function drawOverlay(
  canvas: HTMLCanvasElement, meta: GridMeta,
  { drainage, options, features, boundary, colors }: {
    drainage: Drainage | null
    options: OverlayOptions
    features: OverlayFeature[]
    boundary: Geometry | null
    colors: Record<string, string>
  },
) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  // The mesh's texture coordinates run from the first cell centre (0) to the
  // last (1): cell c sits at c · sx.
  const sx = canvas.width / Math.max(1, meta.cols - 1)
  const sy = canvas.height / Math.max(1, meta.rows - 1)
  if (drainage && (options.axes || options.hollows)) {
    const raster = document.createElement('canvas')
    raster.width = meta.cols
    raster.height = meta.rows
    raster.getContext('2d')?.putImageData(drainageImage(drainage, meta, options), 0, 0)
    context.imageSmoothingEnabled = false
    context.drawImage(raster, -sx / 2, -sy / 2, meta.cols * sx, meta.rows * sy)
  }
  const project = ([lng, lat]: Position): [number, number] => {
    const [x, y] = toMercator(lng, lat)
    return [((x - meta.west) / meta.step) * sx, ((meta.north - y) / meta.step) * sy]
  }
  const pxPerMetre = sx / meta.cellSizeM
  if (options.features) {
    context.lineJoin = 'round'
    context.lineCap = 'round'
    for (const feature of features) {
      const props = feature.properties
      const own = props?.style?.color ?? props?.color
      const color = (typeof own === 'string' && own) || colors[props?.layer ?? ''] || '#fafaf9'
      context.strokeStyle = color
      context.fillStyle = color
      drawGeometry(context, feature.geometry, project, pxPerMetre)
    }
    context.globalAlpha = 1
  }
  if (boundary) {
    context.setLineDash([])
    traceRings(context, boundary, project)
    context.strokeStyle = '#ffffff'
    context.globalAlpha = 0.9
    context.lineWidth = Math.max(4, pxPerMetre * 1.2)
    context.stroke()
    context.globalAlpha = 1
    context.strokeStyle = '#5b5781'
    context.lineWidth = Math.max(2, pxPerMetre * 0.6)
    context.setLineDash([Math.max(6, pxPerMetre * 3), Math.max(4, pxPerMetre * 2)])
    context.stroke()
    context.setLineDash([])
  }
}

function traceRings(context: CanvasRenderingContext2D, geometry: Geometry, project: (p: Position) => [number, number]) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  context.beginPath()
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach((point, k) => {
        const [px, py] = project(point)
        if (k === 0) context.moveTo(px, py)
        else context.lineTo(px, py)
      })
      context.closePath()
    }
  }
}

function drawGeometry(context: CanvasRenderingContext2D, geometry: Geometry | null, project: (p: Position) => [number, number], pxPerMetre: number) {
  if (!geometry) return
  const line = Math.max(2, pxPerMetre * 0.8)
  switch (geometry.type) {
    case 'Polygon':
    case 'MultiPolygon':
      traceRings(context, geometry, project)
      context.globalAlpha = 0.18
      context.fill('evenodd')
      context.globalAlpha = 0.95
      context.lineWidth = line
      context.stroke()
      break
    case 'LineString':
    case 'MultiLineString': {
      const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
      context.beginPath()
      for (const coordinates of lines) {
        coordinates.forEach((point, k) => {
          const [px, py] = project(point)
          if (k === 0) context.moveTo(px, py)
          else context.lineTo(px, py)
        })
      }
      context.globalAlpha = 0.95
      context.lineWidth = line * 1.4
      context.stroke()
      break
    }
    case 'Point':
    case 'MultiPoint': {
      const points = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates
      context.globalAlpha = 0.95
      for (const point of points) {
        const [px, py] = project(point)
        context.beginPath()
        context.arc(px, py, Math.max(3, pxPerMetre * 0.8), 0, Math.PI * 2)
        context.fill()
      }
      break
    }
    case 'GeometryCollection':
      geometry.geometries.forEach((g) => drawGeometry(context, g, project, pxPerMetre))
      break
  }
}
