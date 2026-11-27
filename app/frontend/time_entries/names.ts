/**
 * A name as people say it. Someone with no name on their account shows the
 * start of their e-mail address (« j.chevolet »): read as « J. Chevolet ».
 */
export function readableName(name: string): string {
  if (!/^[a-z]+(?:[._-][a-z]+)+$/.test(name)) return name
  return name.split(/[._-]/).map((part) => (part.length === 1 ? `${part.toUpperCase()}.` : part[0].toUpperCase() + part.slice(1))).join(' ')
}

/** « Christophe Wautier » → « CW », « J. Chevolet » → « JC », « eric » → « E ». */
export function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?'
}
