/**
 * Single owner for camera startup.
 *
 * Every path that used to start the webcam independently (selectCamera,
 * the panel pre-flight, distance tracking, gaze tracking) goes through
 * startCameraSession(). One Promise resolves when the camera is ready or
 * rejects with a CameraSessionError. Success, failure, timeout, and
 * cleanup all travel this path, so a late getUserMedia retry cannot
 * mutate state after failure has already been reported.
 *
 * State: idle → connecting → ready | failed
 */
import { applyWebgazerVideoStyle } from './components/video'

export const CAMERA_SESSION_STATES = {
  idle: 'idle',
  connecting: 'connecting',
  ready: 'ready',
  failed: 'failed',
}

// Must exceed getUserMediaResilient's worst case (~46s) plus FaceMesh
// download. Genuine failures reject through the inner promise long
// before this; the deadline is only a backstop against silent hangs.
export const CAMERA_SESSION_TIMEOUT_MS = 90000

export class CameraSessionError extends Error {
  constructor(message, { phase = 'camera', cause = null } = {}) {
    super(message)
    this.name = 'CameraSessionError'
    this.phase = phase
    this.cause = cause
  }
}

export function createCameraSession() {
  return {
    state: CAMERA_SESSION_STATES.idle,
    error: null,
    generation: 0,
    inFlight: null,
    abortController: null,
  }
}

export function resetCameraSession(gazeTracker) {
  const session = gazeTracker._cameraSession
  if (session?.abortController) {
    try {
      session.abortController.abort()
    } catch (_) {
      /* already aborted */
    }
  }
  gazeTracker._cameraSession = createCameraSession()
}

const _isAbort = error =>
  error?.name === 'AbortError' || error?.startupAbort === true

/**
 * Start (or join) camera startup. Resolves when the video is up and
 * styled; rejects once with a CameraSessionError.
 *
 * @param {object} gazeTracker
 * @param {object} [options]
 * @param {boolean} [options.videoOnly=true]  beginVideo vs begin (gaze loop)
 * @param {number}  [options.pipWidthPx]
 * @param {boolean} [options.requireModel=false]  fail the session if FaceMesh never loaded
 * @param {number}  [options.timeoutMs]
 */
export async function startCameraSession(gazeTracker, options = {}) {
  const {
    videoOnly = true,
    pipWidthPx,
    requireModel = false,
    timeoutMs = CAMERA_SESSION_TIMEOUT_MS,
  } = options

  if (!gazeTracker._cameraSession) {
    gazeTracker._cameraSession = createCameraSession()
  }

  const session = gazeTracker._cameraSession
  const webgazer = gazeTracker.webgazer
  const RC = gazeTracker.calibrator

  const videoOn = !!webgazer.params.videoIsOn && !!gazeTracker._runningVideo
  const needCamera = !webgazer.params.videoIsOn
  const needGazeLoop = !videoOnly && !gazeTracker._running.gaze

  // The fast path must also verify the model when the caller depends on
  // it: the session may have become ready via a videoOnly start whose
  // (parallel) model download failed. In that case fall through and run
  // a full start, which retries the download.
  const modelSatisfied = !requireModel || !!webgazer.getTracker().modelLoaded

  if (
    session.state === CAMERA_SESSION_STATES.ready &&
    videoOn &&
    !needGazeLoop &&
    modelSatisfied
  ) {
    applyWebgazerVideoStyle(
      RC,
      pipWidthPx,
      RC.params.videoOpacity,
      webgazer,
    )
    return
  }

  if (session.state === CAMERA_SESSION_STATES.connecting && session.inFlight) {
    // Join a compatible in-flight start. If this caller also needs the
    // gaze loop and the in-flight start is video-only, wait then retry.
    if (videoOnly || session.wantGaze) return session.inFlight
    await session.inFlight.catch(() => {})
    return startCameraSession(gazeTracker, options)
  }

  session.generation += 1
  const generation = session.generation
  session.state = CAMERA_SESSION_STATES.connecting
  session.error = null
  session.wantGaze = !videoOnly
  session.abortController = new AbortController()

  const run = (async () => {
    const timeoutId = setTimeout(() => {
      try {
        session.abortController.abort()
      } catch (_) {
        /* ignore */
      }
    }, timeoutMs)

    const signal = session.abortController.signal
    webgazer._startupAbort = signal

    const throwIfStale = () => {
      if (signal.aborted || generation !== session.generation) {
        const err = new Error('Camera startup aborted')
        err.name = 'AbortError'
        err.startupAbort = true
        throw err
      }
    }

    const startedAt = performance.now()
    let modelMs = null
    try {
      throwIfStale()

      // Kick the model download so it overlaps camera acquire. init()
      // joins the same in-flight load via _modelLoadingInProgress.
      const modelPromise = webgazer
        .getTracker()
        .loadModel()
        .then(() => {
          modelMs = performance.now() - startedAt
          return null
        })
        .catch(error => {
          modelMs = performance.now() - startedAt
          console.error(
            '[RC] Face model failed to load during camera startup:',
            error,
          )
          return error
        })

      if (needCamera || needGazeLoop) {
        const start = videoOnly
          ? webgazer.beginVideo.bind(webgazer)
          : webgazer.begin.bind(webgazer)
        await start(() => {}, signal)
      }

      throwIfStale()

      const modelError = await modelPromise
      throwIfStale()

      if (
        requireModel &&
        modelError &&
        !webgazer.getTracker().modelLoaded
      ) {
        throw new CameraSessionError(
          'Face model failed to load',
          { phase: 'model', cause: modelError },
        )
      }

      applyWebgazerVideoStyle(
        RC,
        pipWidthPx,
        RC.params.videoOpacity,
        webgazer,
      )

      gazeTracker._runningVideo = true
      gazeTracker.setupCameraMonitoring()
      if (!videoOnly) gazeTracker._running.gaze = true

      session.state = CAMERA_SESSION_STATES.ready
      session.error = null
      session.lastTimings = {
        modelSec:
          modelMs != null ? Number((modelMs / 1000).toFixed(3)) : null,
        totalSec: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
      }
    } catch (error) {
      if (generation === session.generation) {
        session.state = CAMERA_SESSION_STATES.failed
        session.error = error
        session.lastTimings = {
          modelSec:
            modelMs != null ? Number((modelMs / 1000).toFixed(3)) : null,
          totalSec: Number(
            ((performance.now() - startedAt) / 1000).toFixed(3),
          ),
        }
        if (!webgazer.params.videoIsOn) {
          gazeTracker._runningVideo = false
        }
        if (!videoOnly) gazeTracker._running.gaze = false
      }

      if (error instanceof CameraSessionError) throw error

      const phase = _isAbort(error) ? 'timeout' : 'camera'
      const message = _isAbort(error)
        ? `Camera startup timed out after ${timeoutMs}ms`
        : error?.message || 'Camera failed to start'
      throw new CameraSessionError(message, { phase, cause: error })
    } finally {
      clearTimeout(timeoutId)
      if (webgazer._startupAbort === signal) {
        webgazer._startupAbort = null
      }
      if (generation === session.generation) {
        session.inFlight = null
        session.abortController = null
      }
    }
  })()

  session.inFlight = run
  return run
}
