import Swal from 'sweetalert2/dist/sweetalert2.js'

import RemoteCalibrator from '../core'

import { _cross } from '../components/onCanvas'
import { blurAll, sleep, toFixedNumber } from '../helpers'
import text from '../text.json'
import { swalInfoOptions } from '../components/swalOptions'

let inGetAccuracy = false

RemoteCalibrator.prototype.getGazeAccuracy = function (
  options = {},
  callbackSuccess,
  callbackFail
) {
  ////
  if (!this.checkInitialized()) return false
  blurAll()
  ////

  const screenPpi = this.screenPpi
  const viewingDistanceCm = this.viewingDistanceCm

  if (!screenPpi || !viewingDistanceCm) {
    console.error(
      'Screen size and viewing distance measurements are both required to measure gaze accuracy.'
    )
    return false
  }

  options = Object.assign(
    {
      backgroundColor: '#ddd',
      thresholdDeg: 10, // minAccuracy
      decimalPlace: 3,
    },
    options
  )

  // Background
  this._addBackground()
  const canvasDiv = document.createElement('div')
  canvasDiv.innerHTML = `<canvas id="gaze-accuracy-canvas"></canvas>`
  this.background.appendChild(canvasDiv)

  const canvas = document.querySelector('#gaze-accuracy-canvas')
  const ctx = canvas.getContext('2d')

  const _resizeCanvas = () => {
    canvas.style.width = (canvas.width = window.innerWidth) + 'px'
    canvas.style.height = (canvas.height = window.innerHeight) + 'px'
  }
  const resizeObserver = new ResizeObserver(() => {
    _resizeCanvas()
  })
  resizeObserver.observe(this.background)
  _resizeCanvas()

  Swal.fire({
    ...swalInfoOptions,
    // title: text.getGazeAccuracy.headline,
    html: text.getGazeAccuracy.description,
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
        viewingDistanceCm.value
      )

      // ! Store data
      this.newGazeAccuracyData = {
        value: toFixedNumber(averageDegree, options.decimalPlace),
        timestamp: new Date(),
      }

      if (averageDegree < options.thresholdDeg)
        // Success
        callbackSuccess()
      else callbackFail()

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
    let diffInPx = Math.sqrt(
      Math.pow(points[0][i], 2),
      Math.pow(points[1][i], 2)
    )
    // Cm
    let diffInCm = (2.54 * diffInPx) / screenPpi

    // Degree
    degrees += (Math.atan(diffInCm / viewingDistanceCm) * 180) / Math.PI
  }

  degrees /= points[0].length
  return degrees
}
