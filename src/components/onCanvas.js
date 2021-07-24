// Draw cross and circle on the canvas
// For blind spot test and more

import { colorDarkRed } from '../constants'

// CROSS
const crossLW = 32 // Width of a line of the middle cross
const crossLH = 4
export const _getCrossX = (eyeSide, tX) => {
  return eyeSide === 'left' ? tX * 0.1 : tX * 0.9
}
export function _cross(ctx, cX, mY) {
  // Draw a cross at the middle of the canvas
  ctx.fillStyle = '#000'
  ctx.fillRect(cX - (crossLW >> 1), mY - (crossLH >> 1), crossLW, crossLH)
  ctx.fillRect(cX - (crossLH >> 1), mY - (crossLW >> 1), crossLH, crossLW)
}

// CIRCLE
const circleR = 40
export let circleDeltaX = 5

export function _getCircleBounds(side, crossX, cW) {
  return side === 'left'
    ? [crossX + (crossLW + circleR) / 2, cW - (circleR >> 1)]
    : [circleR >> 1, crossX - (crossLW + circleR) / 2]
}

export function _circle(ctx, x, y) {
  ctx.beginPath()
  ctx.arc(x, y, circleR >> 1, 0, Math.PI * 2)
  ctx.closePath()

  ctx.fillStyle = colorDarkRed // Red fill
  ctx.fill()
}
