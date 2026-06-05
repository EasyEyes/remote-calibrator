import { toFixedNumber } from './components/utils'

/** EasyEyes glossary: browser localStorage key for screen position, resolution, and size. */
export const EASY_EYES_SCREEN_SIZE_STORAGE_KEY = 'EasyEyesScreenSize'

const LOG_PREFIX = '[screenSizeCache]'

/**
 * @param {object} [options]
 * @returns {boolean}
 */
export function resolveCalibrateScreenSizeCacheBool(options = {}) {
  const v =
    options.calibrateScreenSizeCacheBool ??
    options._calibrateScreenSizeCacheBool
  let enabled
  if (v === undefined) {
    enabled = true
  } else if (v === true || v === 'TRUE' || v === 'true') {
    enabled = true
  } else if (v === false || v === 'FALSE' || v === 'false') {
    enabled = false
  } else {
    enabled = Boolean(v)
  }
  console.log(
    `${LOG_PREFIX} Cache option resolved: enabled=${enabled} (raw: ${JSON.stringify(v)}, default=true if omitted)`,
  )
  return enabled
}

/**
 * Monitor identity: position (px) and resolution (px). Size in cm is excluded from matching.
 * @returns {{ width: number; height: number; left: number; top: number }}
 */
export function getScreenMonitorFingerprint() {
  return {
    width: window.screen.width,
    height: window.screen.height,
    left: window.screenLeft ?? window.screenX ?? 0,
    top: window.screenTop ?? window.screenY ?? 0,
  }
}

/**
 * @param {object | null | undefined} stored
 * @param {object | null | undefined} current
 */
export function monitorFingerprintsMatch(stored, current) {
  if (!stored || !current) return false
  return (
    stored.width === current.width &&
    stored.height === current.height &&
    stored.left === current.left &&
    stored.top === current.top
  )
}

function logFingerprintMismatch(stored, current) {
  const fields = ['width', 'height', 'left', 'top']
  const diffs = fields
    .filter(f => stored[f] !== current[f])
    .map(f => `${f}: stored=${stored[f]} current=${current[f]}`)
  console.log(
    `${LOG_PREFIX} Monitor fingerprint mismatch — will not use cache. Differences: ${diffs.join('; ') || '(unknown)'}`,
  )
  console.log(`${LOG_PREFIX} Stored fingerprint:`, {
    width: stored.width,
    height: stored.height,
    left: stored.left,
    top: stored.top,
  })
  console.log(`${LOG_PREFIX} Current fingerprint:`, current)
}

/**
 * @returns {object | null} Parsed cache entry if fingerprint matches current monitor.
 */
export function loadValidScreenSizeCache() {
  console.log(
    `${LOG_PREFIX} Attempting read from localStorage key "${EASY_EYES_SCREEN_SIZE_STORAGE_KEY}"`,
  )
  try {
    if (typeof localStorage === 'undefined') {
      console.log(`${LOG_PREFIX} localStorage unavailable — skip cache read`)
      return null
    }
    const raw = localStorage.getItem(EASY_EYES_SCREEN_SIZE_STORAGE_KEY)
    if (!raw) {
      console.log(
        `${LOG_PREFIX} No entry in localStorage (first visit or cleared) — will run credit-card calibration`,
      )
      return null
    }
    console.log(
      `${LOG_PREFIX} Found raw localStorage entry (${raw.length} chars)`,
    )
    const stored = JSON.parse(raw)
    const current = getScreenMonitorFingerprint()
    console.log(`${LOG_PREFIX} Parsed stored entry:`, stored)
    console.log(`${LOG_PREFIX} Current monitor fingerprint:`, current)

    if (
      typeof stored?.screenWidthCm !== 'number' ||
      typeof stored?.screenHeightCm !== 'number' ||
      typeof stored?.screenPpi !== 'number'
    ) {
      console.log(
        `${LOG_PREFIX} Stored entry missing required size fields (screenWidthCm, screenHeightCm, screenPpi) — ignore cache`,
      )
      return null
    }
    if (!monitorFingerprintsMatch(stored, current)) {
      logFingerprintMismatch(stored, current)
      return null
    }
    console.log(
      `${LOG_PREFIX} Valid cache hit — fingerprint matches. Will restore ${stored.screenWidthCm}×${stored.screenHeightCm} cm, PPI=${stored.screenPpi}`,
    )
    return stored
  } catch (err) {
    console.log(`${LOG_PREFIX} Cache read failed (parse/storage error):`, err)
    return null
  }
}

/**
 * @param {object} value Screen data `.value` from calibration (cm, ppi, etc.)
 */
export function saveScreenSizeCache(value) {
  console.log(
    `${LOG_PREFIX} Saving to localStorage after successful calibration`,
  )
  try {
    if (typeof localStorage === 'undefined') {
      console.log(`${LOG_PREFIX} localStorage unavailable — skip cache write`)
      return
    }
    const entry = {
      ...getScreenMonitorFingerprint(),
      screenWidthCm: value.screenWidthCm,
      screenHeightCm: value.screenHeightCm,
      screenPpi: value.screenPpi,
      screenPhysicalPpi: value.screenPhysicalPpi,
      screenDiagonalCm: value.screenDiagonalCm,
      screenDiagonalIn: value.screenDiagonalIn,
    }
    localStorage.setItem(
      EASY_EYES_SCREEN_SIZE_STORAGE_KEY,
      JSON.stringify(entry),
    )
    console.log(
      `${LOG_PREFIX} Wrote key "${EASY_EYES_SCREEN_SIZE_STORAGE_KEY}":`,
      entry,
    )
  } catch (err) {
    console.log(
      `${LOG_PREFIX} Cache write failed (private mode / blocked storage):`,
      err,
    )
  }
}

/**
 * @param {object} entry Valid cache row from {@link loadValidScreenSizeCache}
 * @param {number} toFixedN
 */
export function buildScreenDataFromCache(entry, toFixedN) {
  const screenData = buildScreenDataFromCacheInner(entry, toFixedN)
  console.log(
    `${LOG_PREFIX} Built screenData from cache (fromCache=true):`,
    screenData.value,
  )
  return screenData
}

function buildScreenDataFromCacheInner(entry, toFixedN) {
  const screenPpi = toFixedNumber(entry.screenPpi, toFixedN)
  const screenDiagonalCm = toFixedNumber(
    entry.screenDiagonalCm ??
      Math.hypot(entry.screenWidthCm, entry.screenHeightCm),
    toFixedN,
  )
  const value = {
    screenWidthCm: toFixedNumber(entry.screenWidthCm, toFixedN),
    screenHeightCm: toFixedNumber(entry.screenHeightCm, toFixedN),
    screenPpi,
    screenPhysicalPpi: toFixedNumber(
      entry.screenPhysicalPpi ?? screenPpi * window.devicePixelRatio,
      toFixedN,
    ),
    screenDiagonalCm,
    screenDiagonalIn: toFixedNumber(
      entry.screenDiagonalIn ?? screenDiagonalCm / 2.54,
      toFixedN,
    ),
    screenPpiMean: screenPpi,
    screenPpiStd: 0,
    screenPpiMeasurements: [screenPpi],
    measurementCount: 0,
    totalMeasurementsTaken: 0,
    fromCache: true,
  }

  return {
    value,
    timestamp: performance.now(),
    fromCache: true,
  }
}
