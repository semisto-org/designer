// MapLibre needs WebGL2. When the browser refuses a context it throws while
// building its painter (a GPUInitializationError, or a plain Error on older
// versions) whose message names WebGL: tell that apart from real bugs.
export function isWebGLError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'GPUInitializationError' || /webgl/i.test(error.message)
}
