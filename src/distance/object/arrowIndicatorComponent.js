/**
 * arrowIndicatorComponent.js
 *
 * Creates SVG arrow indicators that point toward the object resting position
 * on measurement pages. Also provides DOM cleanup for arrow elements.
 *
 * Faithfully reproduces the logic from legacy distance.js lines 4050-4171
 * and 7482-7490.
 */

import {
  ARROW_SIZE_CM,
  ARROW_LINE_THICKNESS_PX,
  ARROWHEAD_LENGTH_RATIO,
  ARROWHEAD_ANGLE_DEG,
  DOM_ID,
  Z_INDEX,
} from './objectTestConstants'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Create a single SVG arrow from (fromX, fromY) toward (toX, toY).
 *
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {number} arrowSizePx - Length of the arrow shaft in pixels
 * @returns {SVGElement}
 */
function createSingleArrow(fromX, fromY, toX, toY, arrowSizePx) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.style.position = 'absolute'
  svg.style.top = '0'
  svg.style.left = '0'
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.overflow = 'visible'

  const dx = toX - fromX
  const dy = toY - fromY
  const distancePx = Math.sqrt(dx * dx + dy * dy)
  const unitX = dx / distancePx
  const unitY = dy / distancePx

  const endX = fromX + unitX * arrowSizePx
  const endY = fromY + unitY * arrowSizePx

  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', fromX)
  line.setAttribute('y1', fromY)
  line.setAttribute('x2', endX)
  line.setAttribute('y2', endY)
  line.setAttribute('stroke', 'black')
  line.setAttribute('stroke-width', ARROW_LINE_THICKNESS_PX)
  line.setAttribute('stroke-linecap', 'butt')
  svg.appendChild(line)

  const arrowheadLengthPx = arrowSizePx * ARROWHEAD_LENGTH_RATIO
  const arrowheadAngleRad = ARROWHEAD_ANGLE_DEG * (Math.PI / 180)
  const angleRad = Math.atan2(dy, dx)

  const leftWingX =
    endX - arrowheadLengthPx * Math.cos(angleRad - arrowheadAngleRad)
  const leftWingY =
    endY - arrowheadLengthPx * Math.sin(angleRad - arrowheadAngleRad)
  const leftWing = document.createElementNS(SVG_NS, 'line')
  leftWing.setAttribute('x1', endX)
  leftWing.setAttribute('y1', endY)
  leftWing.setAttribute('x2', leftWingX)
  leftWing.setAttribute('y2', leftWingY)
  leftWing.setAttribute('stroke', 'black')
  leftWing.setAttribute('stroke-width', ARROW_LINE_THICKNESS_PX)
  leftWing.setAttribute('stroke-linecap', 'butt')
  svg.appendChild(leftWing)

  const rightWingX =
    endX - arrowheadLengthPx * Math.cos(angleRad + arrowheadAngleRad)
  const rightWingY =
    endY - arrowheadLengthPx * Math.sin(angleRad + arrowheadAngleRad)
  const rightWing = document.createElementNS(SVG_NS, 'line')
  rightWing.setAttribute('x1', endX)
  rightWing.setAttribute('y1', endY)
  rightWing.setAttribute('x2', rightWingX)
  rightWing.setAttribute('y2', rightWingY)
  rightWing.setAttribute('stroke', 'black')
  rightWing.setAttribute('stroke-width', ARROW_LINE_THICKNESS_PX)
  rightWing.setAttribute('stroke-linecap', 'butt')
  svg.appendChild(rightWing)

  return svg
}

/**
 * Create arrow indicator elements pointing toward a target position.
 * Two arrows are placed at 1/3 and 2/3 of the screen width on the horizontal midline.
 *
 * Legacy: distance.js lines 4050-4171
 *
 * @param {number[]} targetXYPx - [x, y] target position in CSS pixels
 * @param {number} pxPerCm - CSS pixels per centimeter
 * @returns {HTMLDivElement} Container element with arrow SVGs
 */
export function createArrowIndicators(targetXYPx, pxPerCm) {
  const arrowSizePx = ARROW_SIZE_CM * pxPerCm

  const midlineY = window.innerHeight / 2
  const leftArrowX = window.innerWidth / 3
  const rightArrowX = (2 * window.innerWidth) / 3

  const arrowContainer = document.createElement('div')
  arrowContainer.id = DOM_ID.ARROW_INDICATORS
  arrowContainer.style.position = 'fixed'
  arrowContainer.style.top = '0'
  arrowContainer.style.left = '0'
  arrowContainer.style.width = '100%'
  arrowContainer.style.height = '100%'
  arrowContainer.style.pointerEvents = 'none'
  arrowContainer.style.zIndex = Z_INDEX.ARROW_INDICATORS

  const leftArrow = createSingleArrow(
    leftArrowX,
    midlineY,
    targetXYPx[0],
    targetXYPx[1],
    arrowSizePx,
  )
  arrowContainer.appendChild(leftArrow)

  const rightArrow = createSingleArrow(
    rightArrowX,
    midlineY,
    targetXYPx[0],
    targetXYPx[1],
    arrowSizePx,
  )
  arrowContainer.appendChild(rightArrow)

  return arrowContainer
}

/**
 * Remove arrow indicator elements from the DOM by their IDs.
 * Ensures they never reappear during distance check transitions.
 *
 * Legacy: distance.js lines 7482-7490
 */
export function removeArrowIndicatorsFromDOM() {
  ;[DOM_ID.ARROW_INDICATORS, DOM_ID.KNOWN_ARROW_INDICATORS].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.remove()
  })
}
