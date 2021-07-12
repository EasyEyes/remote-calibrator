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
      var currTime = new Date().getTime()
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
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen()
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen()
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen()
    }
  }
}

/* -------------------------------------------------------------------------- */

export function constructInstructions(headline, description = null) {
  return (
    `<div class="calibration-instruction"><h1>${headline}</h1>` +
    (description
      ? `<p class="calibration-description">${description}</p></div>`
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

// https://stackoverflow.com/a/12646864/11069914
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

/**
 *
 * BLUR ALL
 *
 */
export function blurAll() {
  if ('activeElement' in document) document.activeElement.blur()
}
