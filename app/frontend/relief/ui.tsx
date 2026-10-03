// Small controls of the relief page's floating panel (segmented choices,
// toggles, sliders, colour legends).
import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { Ramp } from './colors.ts'

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-loam-500">{children}</p>
}

export type Choice<T> = { value: T; label: ReactNode; title?: string; sub?: ReactNode }

export function ChoiceGroup<T extends string | number>({ value, choices, onChange, columns, label }: {
  value: T
  choices: Choice<T>[]
  onChange: (value: T) => void
  /** Grid columns instead of a single row. */
  columns?: number
  label?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx('gap-0.5 rounded-lg bg-white p-0.5 ring-1 ring-inset ring-loam-200', columns ? 'grid' : 'flex')}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {choices.map((choice) => (
        <button
          key={String(choice.value)}
          type="button"
          title={choice.title}
          aria-pressed={choice.value === value}
          onClick={() => onChange(choice.value)}
          className={clsx(
            'flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition-colors',
            choice.value === value ? 'bg-prune-600 font-semibold text-white' : 'text-loam-600 hover:bg-loam-100',
          )}
        >
          {choice.label}
          {choice.sub && <span className="block text-[0.65rem] opacity-70">{choice.sub}</span>}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={clsx('flex items-start gap-2 text-sm text-loam-800', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-loam-300 accent-prune-600"
      />
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-loam-400">{hint}</span>}
      </span>
    </label>
  )
}

export function Slider({ id, label, display, ...input }: {
  id: string
  label: ReactNode
  display: ReactNode
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-loam-500">{label}</label>
        <span className="text-xs font-semibold tabular-nums text-loam-700">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={input.min}
        max={input.max}
        step={input.step}
        value={input.value}
        onChange={(event) => input.onChange(Number(event.target.value))}
        className="mt-1 w-full accent-prune-600"
      />
    </div>
  )
}

export function rampGradient(stops: Ramp): string {
  return `linear-gradient(to right, ${stops.map(([t, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${Math.round(t * 100)}%`).join(', ')})`
}

export function GradientLegend({ stops, left, right, children }: {
  stops: Ramp
  left: ReactNode
  right: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mt-2">
      <div className="h-2 rounded-full" style={{ background: rampGradient(stops) }} />
      <div className="mt-1 flex justify-between text-xs text-loam-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      {children && <p className="mt-1 text-xs text-loam-400">{children}</p>}
    </div>
  )
}
