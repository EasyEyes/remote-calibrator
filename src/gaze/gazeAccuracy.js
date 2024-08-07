import Swal from 'sweetalert2/dist/sweetalert2.js'

import RemoteCalibrator from '../core'

import { _cross } from '../components/onCanvas'
import {
  blurAll,
  safeExecuteFunc,
  sleep,
  toFixedNumber,
} from '../components/utils'
import { swalInfoOptions } from '../components/swalOptions'

let inGetAccuracy = false

RemoteCalibrator.prototype.getGazeAccuracy = function (
  getGazeAccuracyOptions = {},
  callbackSuccess = undefined,
  callbackFail = undefined,
) {
  ////
  if (!this.checkInitialized()) return false
  blurAll()
  ////

  const screenPpi = this.screenPpi
  const viewingDistanceCm = this.viewingDistanceCm

  if (!screenPpi || !viewingDistanceCm) {
    console.error(
      'Screen size and viewing distance measurements are both required to measure gaze accuracy.',
    )
    return false
  }

  const options = Object.assign(
    {
      backgroundColor: '#eee',
      thresholdDeg: 10, // minAccuracy
      decimalPlace: 3,
    },
    getGazeAccuracyOptions,
  )

  // Background
  this._addBackground()
  const canvasDiv = document.createElement('div')
  canvasDiv.innerHTML = `<canvas id="gaze-accuracy-canvas"></canvas>`
  this.background.appendChild(canvasDiv)

  const canvas = document.querySelector('#gaze-accuracy-canvas')
  const ctx = canvas.getContext('2d')

  const _resizeCanvas = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    canvas.style.width = `${canvas.width}px`
    canvas.style.height = `${canvas.height}px`
  }

  const resizeObserver = new ResizeObserver(() => {
    _resizeCanvas()
  })
  resizeObserver.observe(this.background)
  _resizeCanvas()

  Swal.fire({
    ...swalInfoOptions(this, { showIcon: true }),
    // title: text.getGazeAccuracy.headline,
    html: 'We will measure your gaze accuracy. Please do not move the mouse and look at the fixation at the middle of the screen for the next 5 seconds.',
  }).then(() => {
    // ! After confirming alert
    inGetAccuracy = true
    displayCross(canvas, ctx, options)

    this.gazeTracker.startStoringPoints()

    sleep(5000).then(() => {
      inGetAccuracy = false
      this.gazeTracker.stopStoringPoints()

      const points = this.gazeTracker.webgazer.getStoredPoints()

      const averageDegree = getAverageDegree(
        { x: canvas.width / 2, y: canvas.height / 2 },
        points,
        screenPpi.value,
        viewingDistanceCm.value,
      )

      // ! Store data
      this.newGazeAccuracyData = {
        value: toFixedNumber(averageDegree, options.decimalPlace),
        timestamp: performance.now(),
      }

      if (averageDegree < options.thresholdDeg)
        // Success
        safeExecuteFunc(callbackSuccess)
      else safeExecuteFunc(callbackFail)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      resizeObserver.unobserve(this.background)
      this._removeBackground()
    })
  })

  return true
}

const displayCross = (canvas, ctx, options) => {
  const _d = () => {
    ctx.fillStyle = options.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    _cross(ctx, canvas.width / 2, canvas.height / 2)

    if (inGetAccuracy) requestAnimationFrame(_d)
  }

  requestAnimationFrame(_d)
}

const getAverageDegree = (fixation, points, screenPpi, viewingDistanceCm) => {
  let degrees = 0

  for (let i = 0; i < points[0].length; i++) {
    points[0][i] -= fixation.x
    points[1][i] -= fixation.y
    // Px
    const diffInPx = Math.sqrt(points[0][i] ** 2, points[1][i] ** 2)
    // Cm
    const diffInCm = (2.54 * diffInPx) / screenPpi

    // Degree
    degrees += (Math.atan(diffInCm / viewingDistanceCm) * 180) / Math.PI
  }

  degrees /= points[0].length
  return degrees
}
