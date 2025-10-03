// Draw cross and circle on the canvas
// For blind spot test and more

import { dist2d } from './utils'

// CROSS
export const crossLW = 32 // Width of a line of the middle cross
export const crossLH = 3
export const _getCrossX = (eyeSide, tX) => {
  return eyeSide === 'left' ? tX * 0.1 : tX * 0.9
}
export function _cross(ctx, cX, mY) {
  ctx.fillStyle = '#000'
  ctx.fillRect(cX - (crossLW >> 1), mY - (crossLH >> 1), crossLW, crossLH)
  ctx.fillRect(cX - (crossLH >> 1), mY - (crossLW >> 1), crossLH, crossLW)
}

// CIRCLE
const circleR = 30
export const circleDeltaX = 5

export function _getCircleBounds(side, crossX, cW, radius = circleR >> 1) {
  return side === 'left'
    ? [crossX + (crossLW + radius * 2) / 2, cW - radius]
    : [radius, crossX - (crossLW + radius * 2) / 2]
}

export function _circle(
  RC,
  ctx,
  x,
  y,
  frameTimestampDelta,
  fill,
  sparkle = true,
  radius = circleR >> 1,
) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.closePath()

  if (!sparkle) ctx.fillStyle = fill
  else {
    // 8Hz
    if (frameTimestampDelta % 125 < 63) ctx.fillStyle = fill
    else ctx.fillStyle = '#fff'
  }

  ctx.fill()
}

/* ---------------------------------- Drag ---------------------------------- */

export function clickOnCircle(x, y, mouseX, mouseY, radius = circleR >> 1) {
  return dist2d(x, y, mouseX, mouseY) < radius
}


export function bindMousedown(canvasId, callback) {
  document.getElementById(canvasId).addEventListener('mousedown', callback)
  document.getElementById(canvasId).addEventListener('touchstart', callback)
}

export function unbindMousedown(canvasId, callback) {
  document.getElementById(canvasId).removeEventListener('mousedown', callback)
  document.getElementById(canvasId).removeEventListener('touchstart', callback)
}
