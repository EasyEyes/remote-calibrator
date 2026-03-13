/**
 * debugLogger.js
 *
 * Conditional debug logging utility for the object test modules.
 * All new modules use these helpers instead of raw console.log/warn/error.
 * Toggle DEBUG_ENABLED to true during development to see output.
 */

const DEBUG_ENABLED = false

export function debugLog(category, ...args) {
  if (DEBUG_ENABLED) console.log(`[objectTest:${category}]`, ...args)
}

export function debugWarn(category, ...args) {
  if (DEBUG_ENABLED) console.warn(`[objectTest:${category}]`, ...args)
}

/**
 * Errors are always logged regardless of DEBUG_ENABLED,
 * since they indicate genuine problems.
 */
export function debugError(category, ...args) {
  console.error(`[objectTest:${category}]`, ...args)
}
