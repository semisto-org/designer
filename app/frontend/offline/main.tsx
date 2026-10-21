import '@/entrypoints/application.css'
import { createRoot } from 'react-dom/client'
import { OfflineSite, type OfflineData } from './OfflineSite'
import { installOfflineProtocols } from './protocols'

/**
 * The offline site's entry (OfflineSite::Builder packs it as site/terranova.js,
 * built by `npm run build:offline`). Its data comes from the scripts the
 * export writes beside index.html: donnees/carte.js (window.TERRANOVA_OFFLINE)
 * and donnees/tuiles-*.js (window.TERRANOVA_TILES).
 */
installOfflineProtocols()
const data = (window as unknown as { TERRANOVA_OFFLINE?: OfflineData }).TERRANOVA_OFFLINE
const root = document.getElementById('app')
if (root && data) {
  document.title = data.title
  createRoot(root).render(<OfflineSite data={data} />)
}
