// Every page downloads the whole interface tree (see i18n.ts), so the
// subtrees only the server reads stay out of the browser bundle: e-mails,
// the Claudy and Immich imports, the phone app's own strings, and the MCP
// server's tool descriptions (the browser only shows tool titles; /docs/mcp
// gets the rest as props). Applied by the `rails-locales` plugin of
// vite.config.ts; test/frontend/locales checks no component reads them.
export const SERVER_ONLY_KEYS = new Set([
  'mailer', 'account_mailer', 'billing_mailer', 'comment_mailer', 'drone_mailer', 'magic_link_mailer',
  'map_invitation_mailer', 'map_transfer_mailer', 'project_request_mailer', 'project_sheet_link_mailer',
  'service_request_mailer', 'task_mailer', 'team_invitation_mailer',
  'claudy_import', 'immich_import', 'mobile',
])

type Tree = Record<string, unknown>

export function browserLocales(tree: Tree): Tree {
  const pruned: Tree = {}
  for (const [locale, keys] of Object.entries(tree ?? {})) {
    const kept: Tree = {}
    for (const [key, value] of Object.entries((keys ?? {}) as Tree)) {
      if (SERVER_ONLY_KEYS.has(key)) continue
      kept[key] = key === 'mcp' ? mcpToolTitles(value as Tree) : value
    }
    pruned[locale] = kept
  }
  return pruned
}

function mcpToolTitles(mcp: Tree): Tree {
  const tools = Object.entries((mcp.tools ?? {}) as Record<string, Tree>)
  return { tools: Object.fromEntries(tools.map(([name, tool]) => [name, { title: tool.title }])) }
}
