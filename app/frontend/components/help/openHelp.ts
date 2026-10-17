// Anything (the quick switcher, a link) can open the help drawer on a guide
// with this event; HelpDrawerHost, mounted once, listens to it.
export const OPEN_HELP = 'help:open'

export function openHelp(slug?: string | null) {
  window.dispatchEvent(new CustomEvent(OPEN_HELP, { detail: { slug: slug ?? null } }))
}
