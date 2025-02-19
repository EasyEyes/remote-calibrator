// requestAnimationFrame() polyfill by Erik Möller, Paul Irish, and Tino Zijdel.
// https://gist.github.com/paulirish/1579671

import Swal from 'sweetalert2'
import { remoteCalibratorPhrases } from '../i18n/phrases'
import { phrases } from '../i18n/schema'
;(function () {
  let lastTime = 0
  const vendors = ['ms', 'moz', 'webkit', 'o']

  for (let x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[`${vendors[x]}RequestAnimationFrame`]
    window.cancelAnimationFrame =
      window[`${vendors[x]}CancelAnimationFrame`] ||
      window[`${vendors[x]}CancelRequestAnimationFrame`]
  }

  if (!window.requestAnimationFrame)
    // eslint-disable-next-line no-unused-vars
    window.requestAnimationFrame = function (callback, element) {
      const currTime = performance.now()
      const timeToCall = Math.max(0, 16 - (currTime - lastTime))
      const id = window.setTimeout(function () {
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
        if (target === undefined || target === null) {
          throw new TypeError()
        }

        const to = Object(target)
        for (let i = 1; i < arguments.length; i++) {
          let nextSource = arguments[i]
          if (nextSource === undefined || nextSource === null) {
            continue
          }
          nextSource = Object(nextSource)

          const keysArray = Object.keys(Object(nextSource))
          for (
            let nextIndex = 0, len = keysArray.length;
            nextIndex < len;
            nextIndex++
          ) {
            const nextKey = keysArray[nextIndex]
            const desc = Object.getOwnPropertyDescriptor(nextSource, nextKey)
            if (desc?.enumerable) {
              to[nextKey] = nextSource[nextKey]
            }
          }
        }
        return to
      },
    })
  }
})()

export function safeExecuteFunc(f, ...a) {
  if (f && typeof f === 'function') {
    if (a.length) return f(...a)
    return f()
  }
}

export const emptyFunc = () => {}

// http://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
export function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

/* -------------------------------------------------------------------------- */

// Enter fullscreen
export async function getFullscreen(L = 'en-US', RC = null) {
  if (isFullscreen()) {
    return true
  }
  if (
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled
  ) {
    try {
      return await fullScreen()
    } catch (e) {
      console.log(e)
      // ask for user interaction
      let value = false
      if (RC) {
        RC.disableKeypadHandler = true
      }
      await Swal.fire({
        html: phrases.EE_FullScreenOk[L],
        confirmButtonText: 'OK',
        preConfirm: async () => {
          value = await fullScreen()
        },
      })
      if (RC) {
        RC.disableKeypadHandler = false
      }
      return value
    }
  }

  return false
}

const fullScreen = async () => {
  const element = document.documentElement
  if (element.requestFullscreen) {
    await element.requestFullscreen()
    return true
  }

  if (element.mozRequestFullScreen) {
    await element.mozRequestFullScreen()
    return true
  }

  if (element.webkitRequestFullscreen) {
    await element.webkitRequestFullscreen()
    return true
  }

  if (element.msRequestFullscreen) {
    await element.msRequestFullscreen()
    return true
  }
  return false
}

export function isFullscreen() {
  return (
    document.fullscreenElement != null ||
    document.webkitFullscreenElement != null ||
    document.mozFullScreenElement != null ||
    document.msFullscreenElement != null
  )
}

/* -------------------------------------------------------------------------- */

export function constructInstructions(
  headline,
  description = null,
  scrollable = false,
  descriptionClass = '',
  position = null,
  headline2 = null,
  useDescriptionClassOnly = false,
) {
  return `<div class="calibration-instruction${
    scrollable ? ' calibration-instruction-scrollable' : ''
  }${position === 'left' ? ' calibration-instruction-left' : ''}"><p class="heading1">${headline}</p>${headline2 ? '<p class="heading1">' + headline2 + '</p>' : ''}${
    description
      ? `<p class="${useDescriptionClassOnly ? descriptionClass : 'calibration-description ' + descriptionClass}">${description}</p></div>`
      : ''
  }`
}

/* ----------------------------- Tiny functions ----------------------------- */

export function constrain(a, b0, b1) {
  return a < b0 ? b0 : a > b1 ? b1 : a
}

export function remap(v, a1, b1, a2, b2) {
  return a2 + (b2 - a2) * (((v - a1) * 1.0) / (b1 - a1))
}

export function dist2d(aX, aY, bX, bY) {
  return Math.sqrt((aX - bX) ** 2 + (aY - bY) ** 2)
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
  const pow = 10 ** digits
  return Math.round(n * pow) / pow
}

// https://github.com/30-seconds/30-seconds-of-code/blob/master/snippets/median.md
export const median = arr => {
  const mid = Math.floor(arr.length / 2)
  const num = [...arr].sort((a, b) => a - b)
  return arr.length % 2 !== 0 ? num[mid] : (num[mid - 1] + num[mid]) / 2
}

// https://stackoverflow.com/a/41452260
export const average = array => array.reduce((a, b) => a + b) / array.length

// https://stackoverflow.com/a/49434653
export function randn_bm(min, max, skew = 1) {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)

  num = num / 10.0 + 0.5
  if (num > 1 || num < 0) num = randn_bm(min, max, skew)
  else {
    num = num ** skew
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
  }
  return { x: e.clientX, y: e.clientY }
}

export function replaceNewlinesWithBreaks(str) {
  return str.replace(/\n/g, '<br/>')
}
