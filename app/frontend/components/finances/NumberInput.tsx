import clsx from 'clsx'
import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { inputClass } from '@/components/ui/Field'

const display = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 4, useGrouping: false })

function toText(value: number | null | undefined): string {
  return value == null ? '' : display.format(value)
}

/** "12,5", "12.5", "1 200" -> number; blank -> null; anything else -> undefined (invalid). */
export function parseNumber(text: string): number | null | undefined {
  const clean = text.replace(/[\s  ]/g, '').replace(',', '.')
  if (clean === '') return null
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return undefined
  return Number(clean)
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined
  onValue: (value: number | null) => void
  integer?: boolean
  unit?: string
}

/**
 * A number field that accepts French decimals ("12,5") and keeps what the
 * user types while focused; blank means "not entered" (null), never 0.
 */
export function NumberInput({ value, onValue, integer, unit, className, onBlur, ...rest }: Props) {
  const [text, setText] = useState(toText(value))
  const [focused, setFocused] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!focused) setText(toText(value))
  }, [value, focused])

  return (
    <div className="relative">
      <input
        {...rest}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value)
          const parsed = parseNumber(e.target.value)
          setInvalid(parsed === undefined)
          if (parsed !== undefined) onValue(integer && parsed != null ? Math.round(parsed) : parsed)
        }}
        onBlur={(e) => {
          setFocused(false)
          setInvalid(false)
          setText(toText(value))
          onBlur?.(e)
        }}
        className={clsx(inputClass, 'tabular-nums', unit && 'pr-9', invalid && 'ring-clay-500', className)}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-loam-400">{unit}</span>}
    </div>
  )
}
