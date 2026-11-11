import RemoteCalibrator from '../../core'

const MAX_EVENTS = 50
const now = () => new Date().toISOString()
const text = (value, limit = 500) =>
  value == null ? null : String(value).slice(0, limit)

const cleanValue = (value, depth = 0) => {
  if (value == null || typeof value === 'boolean' || typeof value === 'number')
    return value
  if (typeof value === 'string') return value.slice(0, 500)
  if (depth >= 5) return null
  if (Array.isArray(value))
    return value.slice(0, 100).map(item => cleanValue(item, depth + 1))
  if (typeof value === 'object') {
    const clean = {}
    for (const [key, item] of Object.entries(value)) {
      if (
        key === 'deviceId' ||
        key === 'groupId' ||
        key === 'meshSamples' ||
        key === 'faceMeshSamples' ||
        key === 'faceMeshSamplesPage3' ||
        key === 'faceMeshSamplesPage4' ||
        key === 'srcObject'
      )
        continue
      if (typeof item === 'function' || item === undefined) continue
      clean[key] = cleanValue(item, depth + 1)
    }
    return clean
  }
  return text(value)
}

const locationSnapshot = location => {
  if (!location) return null
  return {
    index: location.index ?? location.locationIndex ?? null,
    locEye: text(location.locEye, 150),
    location: text(location.location, 150),
  }
}

const measurementSnapshot = entry => {
  if (!entry) return null
  return cleanValue({
    accepted: entry.accepted === true,
    locEye: entry.locEye,
    location: entry.location,
    locationIndex: entry.locationIndex,
    rejectionReason: entry.rejectionReason,
    focalRatioPct: entry.focalRatioPct,
    allowedRatioPct: entry.allowedRatioPct,
    fOverWidth: entry.fOverWidth,
    cameraResolution: entry.cameraResolution,
  })
}

export const beginDistanceCalibrationAttempt = (
  RC,
  {
    mode,
    expectedLocationCount = null,
    selectedPaperOption = null,
    selectedPaperLengthCm = null,
    matchHalfLengthBool = null,
    mediaTotal = 0,
  } = {},
) => {
  const at = now()
  // A recalibration restart begins a fresh attempt; earlier runs survive as
  // bounded outcome history (same shape as cameraAttempt's previousOutcomes).
  const previous = RC._distanceCalibrationAttempt
  const previousOutcomes = [
    ...(previous?.previousOutcomes || []),
    ...(previous?.outcome ? [previous.outcome] : []),
  ].slice(-10)
  RC._distanceCalibrationAttempt = {
    version: 1,
    mode: text(mode || 'unknown', 80),
    phase: 'loading-media',
    startedAt: at,
    lastProgressAt: at,
    expectedLocationCount,
    selectedPaperOption: text(selectedPaperOption, 100),
    selectedPaperLengthCm,
    matchHalfLengthBool,
    currentLocation: null,
    attemptsCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    lastAttempt: null,
    lastRejectionReason: null,
    lastBlockedReason: null,
    lastSuccessfulCheckpoint: null,
    persistence: { status: 'pending', error: null },
    media: { completed: 0, total: mediaTotal, errors: [] },
    outcome: null,
    previousOutcomes,
    settledAt: null,
    camera: cameraSnapshot(RC),
    events: [],
  }
  return RC._distanceCalibrationAttempt
}

export const updateDistanceCalibrationAttempt = (RC, patch) => {
  const previous =
    RC._distanceCalibrationAttempt || beginDistanceCalibrationAttempt(RC)
  const cleanPatch = cleanValue({
    ...patch,
    camera: patch.camera ?? cameraSnapshot(RC),
  })
  const previousValues = Object.fromEntries(
    Object.keys(cleanPatch).map(key => [key, previous[key]]),
  )
  const changed = JSON.stringify(previousValues) !== JSON.stringify(cleanPatch)
  RC._distanceCalibrationAttempt = {
    ...previous,
    ...cleanPatch,
    lastProgressAt: changed ? now() : previous.lastProgressAt,
  }
  return RC._distanceCalibrationAttempt
}

export const recordDistanceCalibrationEvent = (RC, type, details = {}) => {
  if (!RC._distanceCalibrationAttempt) beginDistanceCalibrationAttempt(RC)
  const event = { at: now(), type: text(type, 100), ...cleanValue(details) }
  const events = RC._distanceCalibrationAttempt.events || []
  const previous = events[events.length - 1]
  if (
    previous &&
    previous.type === event.type &&
    JSON.stringify({ ...previous, at: null, repeatCount: null }) ===
      JSON.stringify({ ...event, at: null, repeatCount: null })
  ) {
    // A repeated identical event is real participant activity (e.g. SPACE
    // pressed again on an unadjusted tube): count it instead of dropping it.
    // lastProgressAt deliberately stays put — repeats are the stuck signal.
    previous.repeatCount = (previous.repeatCount || 1) + 1
    return
  }
  RC._distanceCalibrationAttempt.events = [...events, event].slice(-MAX_EVENTS)
  RC._distanceCalibrationAttempt.camera = cameraSnapshot(RC)
  RC._distanceCalibrationAttempt.lastProgressAt = event.at
}

export const blockDistanceCalibrationAttempt = (RC, reason, details = {}) => {
  updateDistanceCalibrationAttempt(RC, { lastBlockedReason: reason })
  recordDistanceCalibrationEvent(RC, 'blocked', { reason, ...details })
}

export const createDistanceCalibrationMediaTracker = (
  RC,
  total,
  onProgress,
) => {
  let completed = 0
  const errors = []
  updateDistanceCalibrationAttempt(RC, {
    media: { completed, total, errors: [] },
  })
  return {
    succeeded() {
      completed += 1
      updateDistanceCalibrationAttempt(RC, {
        media: { completed, total, errors: [...errors] },
      })
      recordDistanceCalibrationEvent(RC, 'media-loaded', { completed, total })
      onProgress?.(completed, total)
    },
    failed(id, error) {
      completed += 1
      const failure = {
        id: text(id || 'unknown', 200),
        message: text(error?.message || error || 'media fetch failed'),
      }
      errors.push(failure)
      updateDistanceCalibrationAttempt(RC, {
        media: { completed, total, errors: [...errors] },
      })
      blockDistanceCalibrationAttempt(RC, 'media-fetch-failed', failure)
      onProgress?.(completed, total)
    },
  }
}

export const restoreDistanceCalibrationCameraPage = async (
  RC,
  {
    currentPage,
    isPaperSelectionMode = false,
    currentLocation,
    getCurrentLocation,
    render,
    attach,
  } = {},
) => {
  if (RC._distanceCalibrationAttempt?.outcome) return
  try {
    await render()
    if (RC._distanceCalibrationAttempt?.outcome) return
    attach?.()
    const phase = distanceCalibrationPagePhase(
      currentPage,
      isPaperSelectionMode,
    )
    const location = locationSnapshot(getCurrentLocation?.() ?? currentLocation)
    updateDistanceCalibrationAttempt(RC, {
      phase,
      currentLocation: location,
      lastSuccessfulCheckpoint: { phase, ...location, at: now() },
    })
    recordDistanceCalibrationEvent(RC, 'camera-reconnected')
  } catch (error) {
    recordDistanceCalibrationEvent(RC, 'recovery-failed', {
      message: error?.message || String(error),
    })
    settleDistanceCalibrationAttempt(
      RC,
      'failed',
      error?.message || String(error),
    )
  }
}

export const recordDistanceCalibrationMeasurement = (RC, change) => {
  if (change?.type === 'persistence-failed') {
    const message = change.error?.message || String(change.error)
    updateDistanceCalibrationAttempt(RC, {
      persistence: {
        status: 'failed',
        acceptedCount: null,
        rejectedCount: null,
        totalCount: change.entries?.length ?? 0,
        error: message,
      },
    })
    recordDistanceCalibrationEvent(RC, 'persistence-failed', { message })
    settleDistanceCalibrationAttempt(RC, 'failed', message)
    return
  }
  if (change?.type === 'persistence-succeeded') {
    updateDistanceCalibrationAttempt(RC, {
      persistence: {
        status: 'succeeded',
        acceptedCount: change.result?.acceptedCount ?? 0,
        rejectedCount: change.result?.rejectedCount ?? 0,
        totalCount: change.result?.totalCount ?? 0,
        error: null,
      },
    })
    recordDistanceCalibrationEvent(RC, 'persistence-succeeded', change.result)
    return
  }

  const entry = change?.entry
  if (!entry) return
  const entries = change.entries || []
  const acceptedCount = entries.filter(item => item.accepted).length
  const currentLocation = locationSnapshot(entry)
  const patch = {
    attemptsCount: entries.length,
    acceptedCount,
    rejectedCount: entries.length - acceptedCount,
  }
  // Retroactive rejection changes an earlier entry's acceptance, not which
  // location the participant is currently retrying.
  if (change.type !== 'retroactive-rejection') {
    patch.currentLocation = currentLocation
    patch.lastAttempt = measurementSnapshot(entry)
  }
  if (entry.rejectionReason)
    patch.lastRejectionReason = text(entry.rejectionReason, 200)
  if (entry.accepted) {
    patch.lastBlockedReason = null
    patch.lastSuccessfulCheckpoint = {
      phase: 'measurement',
      ...currentLocation,
      at: now(),
    }
  }
  updateDistanceCalibrationAttempt(RC, patch)
  recordDistanceCalibrationEvent(RC, 'measurement', {
    changeType: change.type,
    ...measurementSnapshot(entry),
  })
}

export const distanceCalibrationPagePhase = (page, isPaperSelectionMode) => {
  if (page === 0 || page === 1) return 'instructions'
  if (page === 2)
    return isPaperSelectionMode ? 'paper-selection' : 'object-measurement'
  if (page === 'tubeCheck') return 'tube-check'
  if (page === 3 || page === 4) return 'measurement'
  return text(page || 'unknown', 80)
}

export const observeDistanceCalibrationPage = async (
  RC,
  page,
  { isPaperSelectionMode = false, getCurrentLocation, render } = {},
) => {
  const phase = distanceCalibrationPagePhase(page, isPaperSelectionMode)
  updateDistanceCalibrationAttempt(RC, {
    phase,
    currentLocation: locationSnapshot(getCurrentLocation?.()),
  })
  recordDistanceCalibrationEvent(RC, 'page', { phase })
  try {
    const result = await render()
    const currentLocation = locationSnapshot(getCurrentLocation?.())
    updateDistanceCalibrationAttempt(RC, {
      currentLocation,
      lastSuccessfulCheckpoint: { phase, ...currentLocation, at: now() },
    })
    return result
  } catch (error) {
    recordDistanceCalibrationEvent(RC, 'page-failed', {
      phase,
      message: error?.message || String(error),
    })
    settleDistanceCalibrationAttempt(
      RC,
      'failed',
      error?.message || String(error),
    )
    throw error
  }
}

export const settleDistanceCalibrationAttempt = (RC, type, reason = null) => {
  const attempt = RC._distanceCalibrationAttempt
  if (!attempt || attempt.outcome) return
  updateDistanceCalibrationAttempt(RC, {
    outcome: { type: text(type, 40), reason: text(reason, 200) },
    settledAt: now(),
  })
  recordDistanceCalibrationEvent(RC, 'settled', { type, reason })
}

/** Mark the whole attempt completed — unless an earlier failure already
 *  settled it (e.g. persistence failure): a failed attempt must never be
 *  relabeled completed by the still-running finish flow. */
export const completeDistanceCalibrationAttempt = RC => {
  settleDistanceCalibrationAttempt(RC, 'completed')
  if (RC._distanceCalibrationAttempt?.outcome?.type === 'completed')
    updateDistanceCalibrationAttempt(RC, { phase: 'completed' })
}

const cameraSnapshot = RC => {
  const video =
    typeof document === 'undefined'
      ? null
      : document.querySelector('#webgazerVideoContainer video')
  const stream = video?.srcObject
  const tracks = stream?.getVideoTracks?.() || []
  return {
    disconnected: RC.gazeTracker?.isCameraDisconnected?.() ?? null,
    streamActive: stream?.active ?? null,
    trackReadyState: tracks.length ? tracks[0].readyState : null,
    trackCount: tracks.length,
    modelLoaded: RC.gazeTracker?.webgazer?.getTracker?.()?.modelLoaded ?? null,
  }
}

export const snapshotDistanceCalibrationAttempt = RC => {
  const attempt = RC?._distanceCalibrationAttempt
  if (!attempt) return null
  const lastProgressMs = Date.parse(attempt.lastProgressAt)
  return {
    ...cleanValue(attempt),
    snapshotAt: now(),
    secSinceLastProgress: Number.isFinite(lastProgressMs)
      ? Math.max(0, (Date.now() - lastProgressMs) / 1000)
      : null,
    camera: attempt.camera ?? cameraSnapshot(RC),
  }
}

// Read-only consumer API. Object-test behavior and legacy results stay unchanged.
RemoteCalibrator.prototype.getDistanceCalibrationAttempt = function () {
  return snapshotDistanceCalibrationAttempt(this)
}
