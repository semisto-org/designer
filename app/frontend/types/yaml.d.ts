declare module '*.yml' {
  const data: Record<string, unknown>
  export default data
}

// Interface strings, cut into segments by the `rails-locales` plugin (vite.config.ts).
declare module 'virtual:rails-locale/*' {}
