import clsx from 'clsx'
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, Map as MapIcon, Presentation } from 'lucide-react'
import type { DocumentKind } from '@/types/documents'

const ICONS = { pdf: FileText, image: FileImage, text: FileText, sheet: FileSpreadsheet, slides: Presentation, plan: MapIcon, other: File }
// Each kind its own ink, like labels on a field notebook's pockets.
const INKS: Record<DocumentKind, string> = {
  pdf: 'text-clay-600 bg-clay-50', image: 'text-leaf-700 bg-leaf-50', text: 'text-prune-700 bg-prune-50',
  sheet: 'text-leaf-700 bg-leaf-50', slides: 'text-humus-700 bg-humus-50', plan: 'text-lichen-700 bg-lichen-50', other: 'text-loam-600 bg-loam-100',
}

export function DocumentIcon({ kind, filename, className }: { kind: DocumentKind; filename?: string | null; className?: string }) {
  const Icon = kind === 'other' && /\.zip$/i.test(filename ?? '') ? FileArchive : ICONS[kind]
  return (
    <span className={clsx('grid place-items-center rounded-lg', INKS[kind], className)}>
      <Icon className="h-1/2 w-1/2" strokeWidth={1.5} aria-hidden />
    </span>
  )
}

export const extensionLabel = (filename: string | null) => (filename?.split('.').pop() ?? '').toUpperCase()
