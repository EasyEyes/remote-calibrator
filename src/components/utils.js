import { debug } from '../debug'

// requestAnimationFrame() polyfill by Erik Möller, Paul Irish, and Tino Zijdel.
// https://gist.github.com/paulirish/1579671
// eslint-disable-next-line no-extra-semi
;(function () {
  var lastTime = 0
  var vendors = ['ms', 'moz', 'webkit', 'o']
  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame']
    window.cancelAnimationFrame =
      window[vendors[x] + 'CancelAnimationFrame'] ||
      window[vendors[x] + 'CancelRequestAnimationFrame']
  }

  if (!window.requestAnimationFrame)
    // eslint-disable-next-line no-unused-vars
    window.requestAnimationFrame = function (callback, element) {
      var currTime = performance.now()
      var timeToCall = Math.max(0, 16 - (currTime - lastTime))
      var id = window.setTimeout(function () {
        callback(currTime + timeToCall)
      }, timeToCall)
      lastTime = currTime + timeToCall
      return id
    }

  if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function (id) {
      clearTimeout(id)
    }

  // Object.assign() polyfill by spiralx
  // https://gist.github.com/spiralx/68cf40d7010d829340cb
  if (!Object.assign) {
    Object.defineProperty(Object, 'assign', {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function (target) {
        'use strict'
        if (target === undefined || target === null) {
          throw new TypeError()
        }

        var to = Object(target)
        for (var i = 1; i < arguments.length; i++) {
          var nextSource = arguments[i]
          if (nextSource === undefined || nextSource === null) {
            continue
          }
          nextSource = Object(nextSource)

          var keysArray = Object.keys(Object(nextSource))
          for (
            var nextIndex = 0, len = keysArray.length;
            nextIndex < len;
            nextIndex++
          ) {
            var nextKey = keysArray[nextIndex]
            var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey)
            if (desc !== undefined && desc.enumerable) {
              to[nextKey] = nextSource[nextKey]
            }
          }
        }
        return to
      },
    })
  }
})()

export function safeGetVar(variable) {
  if (variable === undefined) {
    if (debug) throw 'Variable is undefined.'
    return false
  }
  return variable
}

export function safeExecuteFunc(f, ...a) {
  if (f && typeof f === 'function')
    if (a.length) return f(...a)
    else return f()
}

export async function safeExecuteAsyncFunc(f, ...a) {
  if (f && typeof f === 'function')
    if (a.length) return await f(...a)
    else return await f()
}

export const emptyFunc = () => {}

// http://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
export function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

/* -------------------------------------------------------------------------- */

// Enter fullscreen
export function getFullscreen() {
  if (
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled
  ) {
    const element = document.documentElement
    if (element.requestFullscreen) {
      element.requestFullscreen()
      return true
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen()
      return true
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen()
      return true
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen()
      return true
    } else {
      return false
    }
  } else {
    return false
  }
}

export function isFullscreen() {
  return (
    Math.abs(window.innerHeight - screen.height) < 5 &&
    Math.abs(window.innerWidth - screen.width) < 5 &&
    window.screenX < 5 &&
    window.screenY < 5
  )
}

/* -------------------------------------------------------------------------- */

export function constructInstructions(
  headline,
  description = null,
  scrollable = false,
  descriptionClass = ''
) {
  return (
    `<div class="calibration-instruction${
      scrollable ? ' calibration-instruction-scrollable' : ''
    }"><h1>${headline}</h1>` +
    (description
      ? `<p class="calibration-description${
          descriptionClass.length ? ' ' + descriptionClass : ''
        }">${description}</p></div>`
      : '')
  )
}

/* ----------------------------- Tiny functions ----------------------------- */

export function constrain(a, b0, b1) {
  return a < b0 ? b0 : a > b1 ? b1 : a
}

export function remap(v, a1, b1, a2, b2) {
  return a2 + (b2 - a2) * (((v - a1) * 1.0) / (b1 - a1))
}

export function dist2d(aX, aY, bX, bY) {
  return Math.sqrt(Math.pow(aX - bX, 2) + Math.pow(aY - bY, 2))
}

// https://stackoverflow.com/a/30924333
export function powerOf2(v) {
  return v && !(v & (v - 1))
}

// https://stackoverflow.com/a/12646864
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

export function toFixedNumber(n, digits) {
  let pow = Math.pow(10, digits)
  return Math.round(n * pow) / pow
}

// https://github.com/30-seconds/30-seconds-of-code/blob/master/snippets/median.md
export const median = arr => {
  const mid = Math.floor(arr.length / 2),
    num = [...arr].sort((a, b) => a - b)
  return arr.length % 2 !== 0 ? num[mid] : (num[mid - 1] + num[mid]) / 2
}

// https://stackoverflow.com/a/41452260
export const average = array => array.reduce((a, b) => a + b) / array.length

// https://stackoverflow.com/a/49434653
export function randn_bm(min, max, skew = 1) {
  let u = 0,
    v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)

  num = num / 10.0 + 0.5
  if (num > 1 || num < 0) num = randn_bm(min, max, skew)
  else {
    num = Math.pow(num, skew)
    num *= max - min
    num += min
  }
  return num
}

export const _copy = obj => {
  return JSON.parse(JSON.stringify(obj))
}

/**
 *
 * BLUR ALL
 *
 */
export function blurAll() {
  if ('activeElement' in document) document.activeElement.blur()
}

/* -------------------------------------------------------------------------- */

export const getClickOrTouchLocation = e => {
  if (e.type === 'touchstart' || e.type === 'touchmove') {
    const touch = e.touches[0]
    return { x: touch.clientX, y: touch.clientY }
  } else return { x: e.clientX, y: e.clientY }
}
