// Draw cross and circle on the canvas
// For blind spot test and more

import { dist2d } from './utils'

// CROSS
export const crossLW = 32 // Width of a line of the middle cross
export const crossLH = 3
export const _getCrossX = (eyeSide, tX) => {
  return eyeSide === 'left' ? tX * 0.1 : tX * 0.9
}
export function _cross(ctx, cX, mY, fill = '#ac0d0d') {
  ctx.fillStyle = fill
  ctx.fillRect(cX - (crossLW >> 1), mY - (crossLH >> 1), crossLW, crossLH)
  ctx.fillRect(cX - (crossLH >> 1), mY - (crossLW >> 1), crossLH, crossLW)
}

// CIRCLE
const circleR = 30
export const circleDeltaX = 5

export function _getCircleBounds(
  side,
  crossX,
  cW,
  radius = circleR >> 1,
  ppi = 96,
) {
  // Convert distances to pixels
  const minDistanceCm = 5 // Minimum 5cm from crosshair
  const minDistancePx = (minDistanceCm * ppi) / 2.54

  // Calculate bounds based on spot size and screen constraints
  if (side === 'left') {
    // Left eye: spot moves from crosshair to right edge
    const minFromCrosshair = crossX + minDistancePx // 3cm from crosshair
    const maxFromScreenEdge = cW - radius // Spot edge at screen edge
    const maxFromCrosshair = Math.min(
      maxFromScreenEdge,
      crossX + (cW - crossX - radius),
    ) // Don't go off screen

    return [minFromCrosshair, maxFromCrosshair]
  } else {
    // Right eye: spot moves from left edge to crosshair
    const minFromScreenEdge = radius // Spot edge at screen edge
    const maxFromCrosshair = crossX - minDistancePx // 3cm from crosshair
    const minFromCrosshair = Math.max(
      minFromScreenEdge,
      crossX - (crossX - radius),
    ) // Don't go off screen

    return [minFromCrosshair, maxFromCrosshair]
  }
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

// DIAMOND
export function _diamond(
  RC,
  ctx,
  x,
  y,
  frameTimestampDelta,
  fill,
  sparkle = true,
  width = circleR,
) {
  // Calculate diamond points (square rotated 45 degrees)
  const halfWidth = width / 2
  const points = [
    { x: x, y: y - halfWidth }, // Top
    { x: x + halfWidth, y: y }, // Right
    { x: x, y: y + halfWidth }, // Bottom
    { x: x - halfWidth, y: y }, // Left
  ]

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()

  if (!sparkle) ctx.fillStyle = fill
  else {
    // 8Hz
    if (frameTimestampDelta % 125 < 63) ctx.fillStyle = fill
    else ctx.fillStyle = '#fff'
  }

  ctx.fill()
}

// RED-GREEN SQUARES (for edge-based blindspot test)
// x, y represent the red-green edge (shared border) position
// When size changes, this edge position stays fixed and the squares expand/contract around it
// greenSide: 'near' (toward fixation) or 'far' (away from fixation)
// fixationX: x position of fixation cross to determine near/far direction
export function _redGreenSquares(
  RC,
  ctx,
  x,
  y,
  frameTimestampDelta,
  sparkle = true,
  squareSize = circleR,
  greenSide = 'near',
  fixationX = 0,
) {
  const halfSize = squareSize / 2

  // Determine green square offset direction
  // 'near' means green is between red and fixation (toward fixation)
  // 'far' means green is on opposite side from fixation (away from fixation)
  let greenOffsetX = 0
  if (greenSide === 'near') {
    // Green square toward fixation
    greenOffsetX = fixationX < x ? -squareSize : squareSize
  } else {
    // Green square away from fixation
    greenOffsetX = fixationX < x ? squareSize : -squareSize
  }

  // Calculate square centers from edge position
  // x is the edge (midline), so red and green are offset in opposite directions
  const redX = x - greenOffsetX / 2
  const greenX = x + greenOffsetX / 2

  // Draw green square (steady, no flickering)
  ctx.fillStyle = '#00FF00' // Bright green
  ctx.fillRect(greenX - halfSize, y - halfSize, squareSize, squareSize)

  // Draw red square (flickering at 8Hz)
  if (!sparkle) {
    ctx.fillStyle = '#ac0d0d' // Dark red
  } else {
    // 8Hz flicker
    if (frameTimestampDelta % 125 < 63) {
      ctx.fillStyle = '#ac0d0d' // Dark red
    } else {
      ctx.fillStyle = '#ffffff' // White
    }
  }
  ctx.fillRect(redX - halfSize, y - halfSize, squareSize, squareSize)

  // Return the position of the shared border (which is now just x, y)
  // This is the reported spotXYPx position
  return { x: x, y: y }
}

/* ---------------------------------- Drag ---------------------------------- */

export function clickOnCircle(x, y, mouseX, mouseY, radius = circleR >> 1) {
  return dist2d(x, y, mouseX, mouseY) < radius
}

export function clickOnDiamond(x, y, mouseX, mouseY, width = circleR) {
  // Check if point is inside diamond (square rotated 45 degrees)
  const halfWidth = width / 2
  const dx = Math.abs(mouseX - x)
  const dy = Math.abs(mouseY - y)
  return dx + dy <= halfWidth
}

export function clickOnRedGreenSquares(
  x,
  y,
  mouseX,
  mouseY,
  squareSize = circleR,
  greenSide = 'near',
  fixationX = 0,
) {
  // x, y is the red-green edge (midline)
  const halfSize = squareSize / 2

  // Determine green square offset
  let greenOffsetX = 0
  if (greenSide === 'near') {
    greenOffsetX = fixationX < x ? -squareSize : squareSize
  } else {
    greenOffsetX = fixationX < x ? squareSize : -squareSize
  }

  // Calculate square centers from edge position
  const redX = x - greenOffsetX / 2
  const greenX = x + greenOffsetX / 2

  // Check if click is in red square
  const inRedSquare =
    mouseX >= redX - halfSize &&
    mouseX <= redX + halfSize &&
    mouseY >= y - halfSize &&
    mouseY <= y + halfSize

  // Check if click is in green square
  const inGreenSquare =
    mouseX >= greenX - halfSize &&
    mouseX <= greenX + halfSize &&
    mouseY >= y - halfSize &&
    mouseY <= y + halfSize

  return inRedSquare || inGreenSquare
}

export function bindMousedown(canvasId, callback) {
  document.getElementById(canvasId).addEventListener('mousedown', callback)
  document.getElementById(canvasId).addEventListener('touchstart', callback)
}

export function unbindMousedown(canvasId, callback) {
  document.getElementById(canvasId).removeEventListener('mousedown', callback)
  document.getElementById(canvasId).removeEventListener('touchstart', callback)
}
