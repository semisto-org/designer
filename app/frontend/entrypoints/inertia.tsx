import { createInertiaApp } from '@inertiajs/react'
import AppLayout from '@/layouts/AppLayout'
import PublicLayout from '@/layouts/PublicLayout'

// Pages live in app/frontend/pages/<controller>/<action>.tsx.
// Default layouts: the marketing site and sign-in use PublicLayout, the map
// editor (maps/show) and public map views draw their own full-screen chrome,
// everything else uses AppLayout. A page can still set `Page.layout`.
const FULL_SCREEN = ['maps/show', 'public_maps/show', 'maps/reliefs/show']

void createInertiaApp({
  pages: '../pages',
  strictMode: true,
  title: (title) => (title ? `${title} · Semisto Designer` : 'Semisto Designer'),
  layout: (name) => {
    if (FULL_SCREEN.includes(name)) return null
    if (name.startsWith('pages/') || name.startsWith('sessions/') || name.startsWith('help/')) return PublicLayout
    return AppLayout
  },
  progress: { color: '#5b5781' },
  defaults: {
    form: {
      forceIndicesArrayFormatInFormData: false,
      withAllErrors: true,
    },
    visitOptions: () => ({ queryStringArrayFormat: 'brackets' }),
  },
}).catch((error) => {
  if (document.getElementById('app')) throw error
  console.error('Missing Inertia root element.')
})
