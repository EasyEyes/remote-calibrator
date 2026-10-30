import RemoteCalibrator from './core'

const MAX_EVENTS = 50
const MAX_MESSAGE = 500

const now = () => new Date().toISOString()
const text = (value, limit = MAX_MESSAGE) =>
  value == null ? null : String(value).slice(0, limit)

// Camera labels and classifications are useful diagnostics; stable browser
// device/group identifiers are not needed and must not leave the machine.
const cleanValue = (value, depth = 0) => {
  if (value == null || typeof value === 'boolean' || typeof value === 'number')
    return value
  if (typeof value === 'string') return value.slice(0, MAX_MESSAGE)
  if (depth >= 4) return null
  if (Array.isArray(value))
    return value.slice(0, 100).map(item => cleanValue(item, depth + 1))
  if (typeof value === 'object') {
    const clean = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === 'deviceId' || key === 'groupId') continue
      if (typeof item === 'function' || item === undefined) continue
      clean[key] = cleanValue(item, depth + 1)
    }
    return clean
  }
  return text(value)
}

export const cameraSnapshot = camera => {
  if (!camera) return null
  return {
    name: text(camera.name ?? camera.label ?? '', 300),
    class: text(camera.class ?? camera.incorporation ?? 'unknown', 40),
    builtInScore: camera.builtInScore ?? null,
    externalScore: camera.externalScore ?? null,
    likelyBuiltIn: camera.likelyBuiltIn ?? null,
    kindOverrideApplied: camera.kindOverrideApplied === true,
    opinion: text(camera.opinion, 100),
  }
}

export const cameraFailureReason = error => {
  const chain = []
  for (
    let current = error, depth = 0;
    current && depth < 5;
    current = current.cause, depth += 1
  ) {
    chain.push(current)
    const phase =
      typeof current === 'string'
        ? current
        : `${current.phase || ''} ${current.name || ''} ${
            current.message || ''
          }`
    if (/timeout|timed out|AbortError|TimeoutError/i.test(phase))
      return 'camera-startup-timeout'
    if (
      /NotAllowedError|SecurityError|permission denied|not granted|not allowed/i.test(
        phase,
      )
    )
      return 'permission-denied'
    if (/NotFoundError|DevicesNotFound|no camera/i.test(phase))
      return 'no-camera'
    if (/NotReadableError|camera.*in use|track.*start/i.test(phase))
      return 'camera-in-use'
  }
  return chain.length ? 'camera-startup-failed' : 'unknown'
}

export const cameraErrorSnapshot = error => {
  if (!error) return null
  return {
    name: text(error.name ?? 'Error', 100),
    phase: text(error.phase, 100),
    message: text(error.message ?? error),
    reason: cameraFailureReason(error),
    userEnded: error.userEnded === true,
    cause: error.cause
      ? {
          name: text(error.cause.name, 100),
          message: text(error.cause.message ?? error.cause),
        }
      : null,
  }
}

export const beginCameraAttempt = RC => {
  const previous = RC._cameraAttempt
  const previousOutcomes = [
    ...(previous?.previousOutcomes || []),
    ...(previous?.outcome ? [previous.outcome] : []),
  ].slice(-10)
  const events = previous?.events || []
  const at = now()
  RC._cameraAttempt = {
    version: 1,
    phase: 'idle',
    startedAt: at,
    lastProgressAt: at,
    permission: 'unknown',
    startupError: null,
    enumerationError: null,
    timings: {},
    cameras: [],
    eligibleCameras: [],
    selectedCamera: null,
    unavailableReason: null,
    outcome: null,
    previousOutcomes,
    events,
  }
  return RC._cameraAttempt
}

export const updateCameraAttempt = (RC, patch) => {
  const previous = RC._cameraAttempt || beginCameraAttempt(RC)
  const cleanPatch = cleanValue(patch)
  if (Object.prototype.hasOwnProperty.call(patch, 'cameras'))
    cleanPatch.cameras = (patch.cameras || []).map(cameraSnapshot)
  if (Object.prototype.hasOwnProperty.call(patch, 'eligibleCameras'))
    cleanPatch.eligibleCameras = (patch.eligibleCameras || []).map(
      cameraSnapshot,
    )
  if (Object.prototype.hasOwnProperty.call(patch, 'selectedCamera'))
    cleanPatch.selectedCamera = cameraSnapshot(patch.selectedCamera)
  if (Object.prototype.hasOwnProperty.call(patch, 'startupError'))
    cleanPatch.startupError = cameraErrorSnapshot(patch.startupError)

  const previousValues = Object.fromEntries(
    Object.keys(cleanPatch).map(key => [key, previous[key]]),
  )
  const changed = JSON.stringify(previousValues) !== JSON.stringify(cleanPatch)
  RC._cameraAttempt = {
    ...previous,
    ...cleanPatch,
    lastProgressAt: changed ? now() : previous.lastProgressAt,
  }
  return RC._cameraAttempt
}

export const recordCameraAttemptEvent = (RC, type, details = {}) => {
  if (!RC._cameraAttempt) beginCameraAttempt(RC)
  const event = {
    at: now(),
    type: text(type, 100),
    ...cleanValue(details),
  }
  const events = RC._cameraAttempt.events || []
  const previous = events[events.length - 1]
  if (
    previous &&
    previous.type === event.type &&
    JSON.stringify({ ...previous, at: null }) ===
      JSON.stringify({ ...event, at: null })
  )
    return
  RC._cameraAttempt.events = [...events, event].slice(-MAX_EVENTS)
}

export const recordCameraChoices = (RC, allCameras, eligibleCameras) => {
  const unavailableReason = allCameras.length
    ? eligibleCameras.length
      ? null
      : 'external-only'
    : 'no-camera'
  updateCameraAttempt(RC, {
    phase: 'choosing-camera',
    cameras: allCameras,
    eligibleCameras,
    selectedCamera: RC.selectedCamera || null,
    unavailableReason,
  })
  recordCameraAttemptEvent(RC, 'cameras-enumerated', {
    detected: allCameras.length,
    eligible: eligibleCameras.length,
    unavailableReason,
  })
}

export const recordCameraSelection = (RC, camera) => {
  updateCameraAttempt(RC, {
    phase: 'camera-selected',
    permission: 'granted',
    selectedCamera: camera,
    unavailableReason: null,
  })
  recordCameraAttemptEvent(RC, 'camera-selected', {
    name: camera?.label ?? camera?.name ?? '',
  })
}

export const recordCameraUnavailable = (RC, reason) => {
  updateCameraAttempt(RC, {
    phase: 'no-camera',
    selectedCamera: null,
    unavailableReason: reason,
  })
  recordCameraAttemptEvent(RC, 'camera-unavailable', { reason })
}

export const snapshotCameraAttempt = RC => {
  if (!RC?._cameraAttempt) return null
  return {
    ...cleanValue(RC._cameraAttempt),
    selectedCamera: cameraSnapshot(RC.selectedCamera),
  }
}

// Read-only consumer API. The legacy selectCamera result remains unchanged.
RemoteCalibrator.prototype.getCameraAttempt = function () {
  return snapshotCameraAttempt(this)
}
