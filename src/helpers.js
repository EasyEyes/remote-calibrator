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
})()

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

export function addBackground(inner) {
  let b = document.getElementById('calibration-background')
  if (!b) b = document.createElement('div')

  b.id = 'calibration-background'
  if (inner) b.innerHTML = inner

  document.body.appendChild(b)

  return b
}

/**
 * Remove the calibration background, and its children elements, from the body
 */
export function removeBackground() {
  let b = document.getElementById('calibration-background')
  if (b) {
    document.body.removeChild(b)
    return true
  }
  return false
}

export function constructInstructions(headline, description) {
  return `
<div class="calibration-instruction">
  <h1>${headline}</h1>
  <p>
${description}
  </p>
</div>`
}

/* ----------------------------- Tiny functions ----------------------------- */

export function constrain(a, b0, b1) {
  return a < b0 ? b0 : a > b1 ? b1 : a
}

// https://stackoverflow.com/a/12646864/11069914
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
