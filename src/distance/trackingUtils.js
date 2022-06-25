import { iRepeat } from '../components/iRepeat'
import { safeExecuteFunc, sleep, toFixedNumber } from '../components/utils'

export const iRepeatOptions = { framerate: 20, break: true }

export const trackingOptions = {
  pipWidthPx: 0,
  decimalPlace: 2,
  framerate: 3,
  nearPoint: true,
  showNearPoint: false,
  desiredDistanceCm: undefined,
  desiredDistanceTolerance: 1.2,
  desiredDistanceMonitor: false,
  desiredDistanceMonitorCancelable: false,
}

// dist data measured by blind spot or turn around
export const stdDist = { current: null }
// original style(s) for some DOM elements
export const originalStyles = {
  video: false,
}

/* -------------------------------------------------------------------------- */

export const resetTrackingOptions = () => {
  trackingOptions.pipWidthPx = 0
  trackingOptions.decimalPlace = 2
  trackingOptions.framerate = 3
  trackingOptions.nearPoint = true
  trackingOptions.showNearPoint = false

  trackingOptions.desiredDistanceCm = undefined
  trackingOptions.desiredDistanceTolerance = 1.2
  trackingOptions.desiredDistanceMonitor = false
  trackingOptions.desiredDistanceMonitorCancelable = false
}

export const setTrackingOptions = options => {
  trackingOptions.pipWidthPx = options.pipWidthPx
  trackingOptions.decimalPlace = options.decimalPlace
  trackingOptions.framerate = options.framerate
  trackingOptions.nearPoint = options.nearPoint
  trackingOptions.showNearPoint = options.showNearPoint

  trackingOptions.desiredDistanceCm = options.desiredDistanceCm
  trackingOptions.desiredDistanceTolerance = options.desiredDistanceTolerance
  trackingOptions.desiredDistanceMonitor = options.desiredDistanceMonitor
  trackingOptions.desiredDistanceMonitorCancelable =
    options.desiredDistanceMonitorCancelable
}

/* -------------------------------------------------------------------------- */
// STEP 2 - Live estimate
// callback for getting the first estimate
export const getStdDist = (RC, distData, originalGazer, callbackStatic) => {
  RC.showVideo(originalStyles.video)
  originalStyles.video = false

  if (RC.gazeTracker.checkInitialized('gaze', false))
    RC.showGazer(originalGazer)

  // call the callback for standard result
  safeExecuteFunc(callbackStatic, distData)
  // record standard measure result
  stdDist.current = distData
}

/* -------------------------------------------------------------------------- */

export const startTrackingPupils = async (
  RC,
  beforeCallbackTrack,
  callbackTrack,
  trackingConfig,
  _tracking
) => {
  RC.gazeTracker.beginVideo({ pipWidthPx: trackingOptions.pipWidthPx }, () => {
    RC._removeFloatInstructionElement()
    safeExecuteFunc(beforeCallbackTrack)
    _tracking(RC, trackingOptions, callbackTrack, trackingConfig)
  })
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
// ! tracking
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

export const stdFactor = { current: null }
export const viewingDistanceTrackingFunction = { current: null }

export const nearPointDot = { current: null }

export const readyToGetFirstData = { current: null }
export const averageDist = { current: 0 }
export const distCount = { current: 1 }

export const eyeDist = (a, b) => {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export const cyclopean = (video, a, b) => {
  return [
    (-a[0] - b[0] + video.videoWidth) / 2,
    (-a[1] - b[1] + video.videoHeight) / 2,
  ]
}

export const _getNearPoint = (
  RC,
  trackingOptions,
  video,
  mesh,
  averageDist,
  timestamp,
  ppi,
  latency
) => {
  let offsetToVideoCenter = cyclopean(video, mesh[133], mesh[362])
  offsetToVideoCenter.forEach((offset, i) => {
    // Average inter-pupillary distance - 6.4cm
    offsetToVideoCenter[i] =
      ((RC.PDCm ? RC.PDCm.value : RC._CONST.N.PD_DONT_USE) * offset) /
      averageDist
  })

  let nPData = (RC.newNearPointData = {
    value: {
      x: toFixedNumber(offsetToVideoCenter[0], trackingOptions.decimalPlace),
      y: toFixedNumber(
        offsetToVideoCenter[1] + ((screen.height / 2) * 2.54) / ppi, // Commonly the webcam is 0.5cm above the screen
        trackingOptions.decimalPlace
      ),
      latencyMs: latency,
    },
    timestamp: timestamp,
  })

  // SHOW
  const dotR = 5
  if (trackingOptions.showNearPoint) {
    let offsetX = (nPData.value.x * ppi) / 2.54
    let offsetY = (nPData.value.y * ppi) / 2.54
    Object.assign(nearPointDot.current.style, {
      left: `${screen.width / 2 - window.screenLeft + offsetX - dotR}px`,
      top: `${
        screen.height / 2 -
        window.screenTop -
        (window.outerHeight - window.innerHeight) -
        offsetY -
        dotR
      }px`,
    })
  }

  return nPData
}

export const _tracking = async (
  RC,
  trackingOptions,
  callbackTrack,
  trackingConfig
) => {
  const video = document.querySelector('#webgazerVideoFeed')

  const _ = async () => {
    // const canvas = RC.gazeTracker.webgazer.videoCanvas
    let model, faces

    // Get the average of 5 estimates for one measure
    averageDist.current = 0
    distCount.current = 1
    const targetCount = 5

    model = await RC.gazeTracker.webgazer.getTracker().model

    // Near point
    let ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE
    if (!RC.screenPpi && trackingOptions.nearPoint)
      console.error(
        'Screen size measurement is required to get accurate near point tracking.'
      )

    // show near point
    if (trackingOptions.nearPoint && trackingOptions.showNearPoint) {
      nearPointDot.current = document.createElement('div')
      nearPointDot.current.id = 'rc-near-point-dot'
      document.body.appendChild(nearPointDot.current)

      Object.assign(nearPointDot.current.style, {
        display: 'block',
        zIndex: 999999,
        width: '10px', // TODO Make it customizable
        height: '10px',
        background: 'green',
        position: 'fixed',
        top: '-15px',
        left: '-15px',
      })
    }

    readyToGetFirstData.current = false
    const {
      desiredDistanceCm,
      desiredDistanceTolerance,
      desiredDistanceMonitor,
      desiredDistanceMonitorCancelable,
    } = trackingOptions

    // Always enable correct on a fresh start
    RC._distanceTrackNudging.distanceCorrectEnabled = true
    RC._distanceTrackNudging.distanceDesired = desiredDistanceCm
    RC._distanceTrackNudging.distanceAllowedRatio = desiredDistanceTolerance

    viewingDistanceTrackingFunction.current = async () => {
      //
      const videoTimestamp = performance.now()
      //
      faces = await model.estimateFaces(video)
      if (faces.length) {
        // There's at least one face in video
        RC._trackingVideoFrameTimestamps.distance += videoTimestamp
        // https://github.com/tensorflow/tfjs-models/blob/master/facemesh/mesh_map.jpg
        const mesh = faces[0].scaledMesh

        if (targetCount === distCount.current) {
          averageDist.current += eyeDist(mesh[133], mesh[362])
          averageDist.current /= targetCount
          RC._trackingVideoFrameTimestamps.distance /= targetCount

          // TODO Add more samples for the first estimate
          if (stdDist.current !== null) {
            if (!stdFactor.current) {
              // ! First time estimate
              // Face_Known_Px  *  Distance_Known_Cm  =  Face_Now_Px  *  Distance_x_Cm
              // Get the factor to be used for future predictions
              stdFactor.current = averageDist.current * stdDist.current.value
              // ! FINISH
              if (!trackingConfig.options.check) RC._removeBackground() // Remove BG if no check
              RC._trackingSetupFinishedStatus.distance = true
              readyToGetFirstData.current = true
            }

            /* -------------------------------------------------------------------------- */

            const timestamp = performance.now()
            const latency = Math.round(
              timestamp - RC._trackingVideoFrameTimestamps.distance
            )

            const data = (RC.newViewingDistanceData = {
              value: toFixedNumber(
                stdFactor.current / averageDist.current,
                trackingOptions.decimalPlace
              ),
              timestamp: timestamp,
              method: RC._CONST.VIEW_METHOD.F,
              latencyMs: latency,
            })

            if (readyToGetFirstData.current || desiredDistanceMonitor) {
              // ! Check distance
              if (desiredDistanceCm)
                RC.nudgeDistance(
                  desiredDistanceMonitorCancelable,
                  trackingConfig
                )
              readyToGetFirstData.current = false
            }

            /* -------------------------------------------------------------------------- */

            // Near point
            let nPData
            if (trackingOptions.nearPoint) {
              nPData = _getNearPoint(
                RC,
                trackingOptions,
                video,
                mesh,
                averageDist.current,
                timestamp,
                ppi,
                latency
              )
            }

            /* -------------------------------------------------------------------------- */

            if (callbackTrack && typeof callbackTrack === 'function') {
              RC.gazeTracker.defaultDistanceTrackCallback = callbackTrack
              callbackTrack({
                value: {
                  viewingDistanceCm: data.value,
                  nearPointCm: nPData
                    ? {
                        x: nPData.value.x,
                        y: nPData.value.y,
                      }
                    : {
                        x: null,
                        y: null,
                      },
                  latencyMs: latency,
                },
                timestamp: timestamp,
                method: RC._CONST.VIEW_METHOD.F,
              })
            }
          }

          averageDist.current = 0
          distCount.current = 1

          RC._trackingVideoFrameTimestamps.distance = 0
        } else {
          averageDist.current += eyeDist(mesh[133], mesh[362])
          ++distCount.current
        }
      }
    }

    iRepeatOptions.break = false
    iRepeatOptions.framerate = targetCount * trackingOptions.framerate // Default 5 * 3
    iRepeat(viewingDistanceTrackingFunction.current, iRepeatOptions)
  }

  sleep(1000).then(_)
}
