import { createLucideIcon, type LucideIcon, type LucideIconData } from 'lucide-react'
import { __iconData as armchair } from 'lucide-react/dist/esm/icons/armchair.mjs'
import { __iconData as brickWall } from 'lucide-react/dist/esm/icons/brick-wall.mjs'
import { __iconData as circleDot } from 'lucide-react/dist/esm/icons/circle-dot.mjs'
import { __iconData as circleGauge } from 'lucide-react/dist/esm/icons/circle-gauge.mjs'
import { __iconData as cloudRain } from 'lucide-react/dist/esm/icons/cloud-rain.mjs'
import { __iconData as cylinder } from 'lucide-react/dist/esm/icons/cylinder.mjs'
import { __iconData as doorOpen } from 'lucide-react/dist/esm/icons/door-open.mjs'
import { __iconData as droplet } from 'lucide-react/dist/esm/icons/droplet.mjs'
import { __iconData as droplets } from 'lucide-react/dist/esm/icons/droplets.mjs'
import { __iconData as egg } from 'lucide-react/dist/esm/icons/egg.mjs'
import { __iconData as ethernetPort } from 'lucide-react/dist/esm/icons/ethernet-port.mjs'
import { __iconData as faucet } from 'lucide-react/dist/esm/icons/faucet.mjs'
import { __iconData as fence } from 'lucide-react/dist/esm/icons/fence.mjs'
import { __iconData as flame } from 'lucide-react/dist/esm/icons/flame.mjs'
import { __iconData as footprints } from 'lucide-react/dist/esm/icons/footprints.mjs'
import { __iconData as gauge } from 'lucide-react/dist/esm/icons/gauge.mjs'
import { __iconData as gitCommitHorizontal } from 'lucide-react/dist/esm/icons/git-commit-horizontal.mjs'
import { __iconData as hexagon } from 'lucide-react/dist/esm/icons/hexagon.mjs'
import { __iconData as house } from 'lucide-react/dist/esm/icons/house.mjs'
import { __iconData as landPlot } from 'lucide-react/dist/esm/icons/land-plot.mjs'
import { __iconData as mountain } from 'lucide-react/dist/esm/icons/mountain.mjs'
import { __iconData as pawPrint } from 'lucide-react/dist/esm/icons/paw-print.mjs'
import { __iconData as plugZap } from 'lucide-react/dist/esm/icons/plug-zap.mjs'
import { __iconData as rectangleHorizontal } from 'lucide-react/dist/esm/icons/rectangle-horizontal.mjs'
import { __iconData as recycle } from 'lucide-react/dist/esm/icons/recycle.mjs'
import { __iconData as route } from 'lucide-react/dist/esm/icons/route.mjs'
import { __iconData as ruler } from 'lucide-react/dist/esm/icons/ruler.mjs'
import { __iconData as shrub } from 'lucide-react/dist/esm/icons/shrub.mjs'
import { __iconData as signature } from 'lucide-react/dist/esm/icons/signature.mjs'
import { __iconData as spline } from 'lucide-react/dist/esm/icons/spline.mjs'
import { __iconData as squareParking } from 'lucide-react/dist/esm/icons/square-parking.mjs'
import { __iconData as stickyNote } from 'lucide-react/dist/esm/icons/sticky-note.mjs'
import { __iconData as tent } from 'lucide-react/dist/esm/icons/tent.mjs'
import { __iconData as thermometerSun } from 'lucide-react/dist/esm/icons/thermometer-sun.mjs'
import { __iconData as toyBrick } from 'lucide-react/dist/esm/icons/toy-brick.mjs'
import { __iconData as tractor } from 'lucide-react/dist/esm/icons/tractor.mjs'
import { __iconData as treeDeciduous } from 'lucide-react/dist/esm/icons/tree-deciduous.mjs'
import { __iconData as trees } from 'lucide-react/dist/esm/icons/trees.mjs'
import { __iconData as warehouse } from 'lucide-react/dist/esm/icons/warehouse.mjs'
import { __iconData as waves } from 'lucide-react/dist/esm/icons/waves-horizontal.mjs'
import { __iconData as wind } from 'lucide-react/dist/esm/icons/wind.mjs'
import { __iconData as zap } from 'lucide-react/dist/esm/icons/zap.mjs'

// Icons of the element library (config/map_elements.yml `icon`), as raw
// lucide data: React components for the toolbar and the inspector, canvas
// drawings for the map symbols and the PDF legend.
const ICON_DATA: Record<string, LucideIconData> = {
  'armchair': armchair,
  'brick-wall': brickWall,
  'circle-dot': circleDot,
  'circle-gauge': circleGauge,
  'cloud-rain': cloudRain,
  'cylinder': cylinder,
  'door-open': doorOpen,
  'droplet': droplet,
  'droplets': droplets,
  'egg': egg,
  'ethernet-port': ethernetPort,
  'faucet': faucet,
  'fence': fence,
  'flame': flame,
  'footprints': footprints,
  'gauge': gauge,
  'git-commit-horizontal': gitCommitHorizontal,
  'hexagon': hexagon,
  'house': house,
  'land-plot': landPlot,
  'mountain': mountain,
  'paw-print': pawPrint,
  'plug-zap': plugZap,
  'rectangle-horizontal': rectangleHorizontal,
  'recycle': recycle,
  'route': route,
  'ruler': ruler,
  'shrub': shrub,
  'signature': signature,
  'spline': spline,
  'square-parking': squareParking,
  'sticky-note': stickyNote,
  'tent': tent,
  'thermometer-sun': thermometerSun,
  'toy-brick': toyBrick,
  'tractor': tractor,
  'tree-deciduous': treeDeciduous,
  'trees': trees,
  'warehouse': warehouse,
  'waves': waves,
  'wind': wind,
  'zap': zap,
}

const components = new Map<string, LucideIcon>()

/** The lucide React component of an icon name (a dot when unknown). */
export function iconComponent(name: string): LucideIcon {
  const data = ICON_DATA[name] ?? ICON_DATA['circle-dot']
  let component = components.get(name)
  if (!component) {
    component = createLucideIcon(data)
    components.set(name, component)
  }
  return component
}

type Attrs = Record<string, string | number | undefined>

function num(value: string | number | undefined, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '')
  return Number.isFinite(n) ? n : fallback
}

function points(value: string | number | undefined): number[][] {
  const list = String(value ?? '').trim().split(/[\s,]+/).map(Number)
  const out: number[][] = []
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]])
  return out
}

/** One lucide node as a canvas path, in the icon's 24×24 coordinates. */
function nodePath(tag: string, a: Attrs): Path2D | null {
  const path = new Path2D()
  switch (tag) {
    case 'path':
      return a.d ? new Path2D(String(a.d)) : null
    case 'circle':
      path.arc(num(a.cx), num(a.cy), num(a.r), 0, Math.PI * 2)
      return path
    case 'ellipse':
      path.ellipse(num(a.cx), num(a.cy), num(a.rx), num(a.ry), 0, 0, Math.PI * 2)
      return path
    case 'rect': {
      const [x, y, w, h, r] = [num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx ?? a.ry)]
      if (r > 0 && typeof path.roundRect === 'function') path.roundRect(x, y, w, h, r)
      else path.rect(x, y, w, h)
      return path
    }
    case 'line':
      path.moveTo(num(a.x1), num(a.y1))
      path.lineTo(num(a.x2), num(a.y2))
      return path
    case 'polyline':
    case 'polygon': {
      const pts = points(a.points)
      pts.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)))
      if (tag === 'polygon') path.closePath()
      return path
    }
    default:
      return null
  }
}

/**
 * Draws an icon on a canvas: `size` pixels wide with its top-left corner at
 * (x, y), stroked in `color` like lucide does (2 px at 24 px, round caps).
 */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, strokeWidth = 2) {
  const data = ICON_DATA[name] ?? ICON_DATA['circle-dot']
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [tag, attrs] of data.node) {
    const path = nodePath(tag, attrs as Attrs)
    if (!path) continue
    const fill = (attrs as Attrs).fill
    if (fill && fill !== 'none') ctx.fill(path)
    ctx.stroke(path)
  }
  ctx.restore()
}

export const ICON_NAMES = Object.keys(ICON_DATA)
