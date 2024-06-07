import {
  randn_bm,
  safeExecuteFunc,
  sleep,
  toFixedNumber,
} from './components/utils'
import RemoteCalibrator from './core'
import { phrases } from './i18n/schema'

RemoteCalibrator.prototype.performanceCompute = async function (
  callback,
  __internalCall__ = false,
) {
  ////
  if (!this.checkInitialized()) return
  ////

  const countStartTime = performance.now()
  const numberCounter = {
    _useless: undefined,
    time: 0,
    randomTime: 0,
  }
  while (performance.now() - countStartTime < 500) {
    numberCounter._useless = Array(5000).fill(Math.floor(Math.random() * 10))
    numberCounter.time++
  }

  const countStartTimeRandom = performance.now()
  numberCounter._useless = 0
  while (performance.now() - countStartTimeRandom < 500) {
    numberCounter._useless += Math.random()
    numberCounter.randomTime++
  }

  const data = {
    value: {
      computeArrayFillMHz: toFixedNumber((2 * numberCounter.time) / 1e6, 3),
      computeRandomMHz: toFixedNumber((2 * numberCounter.randomTime) / 1e6, 3),
      idealFps: undefined,
      stressFps: undefined,
    },
    timestamp: performance.now(),
  }

  if (!__internalCall__) this.newPerformanceData = data

  safeExecuteFunc(callback, data)

  return data
}

RemoteCalibrator.prototype.performance = async function (
  performanceOptions = {},
  callback = undefined,
) {
  ////
  if (!this.checkInitialized()) return
  ////

  const options = Object.assign(
    {
      testComputation: true,
      testFrameCount: 180,
      testObjectCount: 10000,
      headline: `🚀 ${phrases.RC_performanceTitle[this.L]}`,
      description: phrases.RC_performanceIntro[this.L],
    },
    performanceOptions,
  )

  this._addBackground()
  this._addBackgroundText(options.headline, options.description)
  await sleep(200)

  // one could skip testing computation performance
  const computingPerformanceData = options.testComputation
    ? await this.performanceCompute(null, true)
    : {
        value: {
          computeArrayFillMHz: undefined,
          computeRandomMHz: undefined,
        },
      }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  this.background.appendChild(canvas)

  // check the ideal/default frame rate of the display under requestAnimationFrame
  const configData = await startConfigTest(ctx)
  const timingData = await startGraphicsTest(
    ctx,
    options.testFrameCount,
    options.testObjectCount,
  )

  const data = {
    value: {
      computeArrayFillMHz: computingPerformanceData.value.computeArrayFillMHz,
      computeRandomMHz: computingPerformanceData.value.computeRandomMHz,
      idealFps: Math.round(60000 / (configData.end - configData.start)),
      stressFps: Math.round(
        (1000 * options.testFrameCount) / (timingData.end - timingData.start),
      ),
    },
    timestamp: performance.now(),
  }
  this.newPerformanceData = data

  this._removeBackground()

  safeExecuteFunc(callback, data)
  return data
}

const startConfigTest = () => {
  let inTest = 60
  const startTime = performance.now()
  return new Promise(resolve => {
    const runTest = () => {
      inTest--
      if (inTest > 0) {
        requestAnimationFrame(runTest)
      } else {
        resolve({
          start: startTime,
          end: performance.now(),
        })
      }
    }

    requestAnimationFrame(runTest)
  })
}

const startGraphicsTest = async (ctx, testFrameCount, testObjectCount) => {
  let inTest = testFrameCount
  const rects = []

  const strokeColors = ['#000000', '#333333', '#999999']
  for (let i = 0; i < testObjectCount; i++)
    rects.push(new TestRect(strokeColors))

  ctx.fillStyle = '#ffffff'
  // ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  const startTime = performance.now()
  return new Promise(resolve => {
    const runTest = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.beginPath()

      for (const rect of rects) {
        rect.move()
        rect.draw(ctx)
      }

      inTest--
      if (inTest > 0) {
        requestAnimationFrame(runTest)
      } else {
        resolve({
          start: startTime,
          end: performance.now(),
        })
      }
    }

    requestAnimationFrame(runTest)
  })
}

/* -------------------------------------------------------------------------- */

class TestRect {
  constructor(strokeColors) {
    this.w = randn_bm(20, 70)
    this.h = randn_bm(30, 70)
    this.x = -this.w + Math.random() * window.innerWidth
    this.y = -this.h / 2 + Math.random() * (window.innerHeight + this.h / 2)

    this.speed = randn_bm(1, 5)
    this.stroke = strokeColors[Math.floor(Math.random() * strokeColors.length)]
  }

  move() {
    this.x += this.speed + Math.random() * 0.5
    if (this.x > window.innerWidth) this.x = -this.w
  }

  draw(ctx) {
    ctx.strokeStyle = this.stroke
    ctx.fillRect(this.x, this.y, this.w, this.h)
    ctx.strokeRect(this.x, this.y, this.w, this.h)
  }
}
