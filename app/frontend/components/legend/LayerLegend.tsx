import { useId, useState } from 'react'
import { t } from '@/lib/i18n'
import { classCount, FOLD_AFTER, foldedItems, hasOwnLegend, type Legendable } from '@/components/legend/legend'
import type { LayerLegendItem } from '@/types'

export { hasLegend } from '@/components/legend/legend'

/**
 * How to read a data layer: a colour scale, a list of classes or, for a
 * layer without its own legend, the image its service publishes.
 */
export function LayerLegend({ layer }: { layer: Legendable }) {
  const legend = layer.legend
  if (!legend || !hasOwnLegend(layer)) {
    return layer.legendUrl ? <LegendImage url={layer.legendUrl} name={layer.name} /> : null
  }
  return (
    <div className="space-y-1.5" data-testid="layer-legend">
      {legend.gradient && <Gradient {...legend.gradient} />}
      {legend.items && legend.items.length > 0 && <Classes items={legend.items} />}
      {legend.note && <p className="text-xs leading-snug text-loam-500">{legend.note}</p>}
    </div>
  )
}

function Gradient({ colors, labels }: { colors: string[]; labels: string[] }) {
  const background = colors.length > 1 ? `linear-gradient(to right, ${colors.join(', ')})` : colors[0]
  return (
    <div>
      <div className="h-2.5 rounded-full ring-1 ring-inset ring-loam-900/10" style={{ background }} aria-hidden="true" />
      <div className="mt-1 flex justify-between gap-1 text-[11px] tabular-nums text-loam-600">
        {labels.map((label, index) => <span key={index}>{label}</span>)}
      </div>
    </div>
  )
}

function Classes({ items }: { items: LayerLegendItem[] }) {
  const [open, setOpen] = useState(false)
  const classes = classCount(items)
  const folds = classes > FOLD_AFTER
  const shown = open ? items : foldedItems(items)
  return (
    <div>
      <ul className="space-y-1">
        {shown.map((item, index) =>
          'heading' in item ? (
            <li key={index} className="pt-1 text-[11px] font-medium text-loam-600 first:pt-0">{item.heading}</li>
          ) : (
            <li key={index} className="flex items-start gap-2 text-xs leading-tight text-loam-700">
              <Swatch item={item} />
              <span>{item.label}</span>
            </li>
          ),
        )}
      </ul>
      {folds && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="mt-1 rounded px-1 py-0.5 text-xs text-prune-600 hover:bg-prune-50"
        >
          {open ? t('map_data.legend.show_less') : t('map_data.legend.show_all', { count: classes })}
        </button>
      )}
    </div>
  )
}

function Swatch({ item }: { item: Extract<LayerLegendItem, { label: string }> }) {
  // useId() holds characters a url(#…) reference does not accept.
  const pattern = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const { color, stroke } = item
  const border = stroke ?? 'rgba(42, 33, 26, 0.25)'
  let shape
  switch (item.shape) {
    case 'line':
      shape = <line x1="1" y1="6" x2="17" y2="6" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      break
    case 'dashed':
      shape = <line x1="1" y1="6" x2="17" y2="6" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
      break
    case 'outline':
      shape = stroke
        ? <rect x="1" y="1" width="16" height="10" rx="1.5" fill={color} stroke={stroke} strokeWidth="1.5" />
        : <rect x="1" y="1" width="16" height="10" rx="1.5" fill="none" stroke={color} strokeWidth="1.5" />
      break
    case 'hatch':
      shape = (
        <>
          <defs>
            <pattern id={pattern} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect x="1" y="1" width="16" height="10" rx="1.5" fill={`url(#${pattern})`} stroke={color} strokeWidth="1" />
        </>
      )
      break
    case 'split':
      shape = (
        <>
          <path d="M1 1 H17 L1 11 Z" fill={color} />
          <path d="M17 1 V11 H1 Z" fill={stroke} />
          <rect x="1" y="1" width="16" height="10" rx="1.5" fill="none" stroke="rgba(42, 33, 26, 0.25)" />
        </>
      )
      break
    case 'point':
      shape = <circle cx="9" cy="6" r="3.5" fill={color} stroke="rgba(255, 255, 255, 0.9)" />
      break
    default:
      shape = <rect x="1" y="1" width="16" height="10" rx="1.5" fill={color} stroke={border} strokeWidth={stroke ? 1.5 : 1} />
  }
  return (
    <svg viewBox="0 0 18 12" className="mt-px h-3 w-[18px] shrink-0" aria-hidden="true">
      {shape}
    </svg>
  )
}

function LegendImage({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="rounded-md bg-white" data-testid="layer-legend">
      <img
        src={url}
        alt={t('map_data.legend.image_alt', { name })}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="max-w-full"
      />
    </div>
  )
}
