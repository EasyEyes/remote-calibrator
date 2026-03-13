/**
 * tubeCheckComponent.js
 *
 * Tube check tape UI component for the object-based distance calibration.
 * Faithfully reproduces the diagonal tape from the legacy objectTest function
 * in distance.js (createTubeCheckTapeComponent, updateTubeCheckTapePosition,
 * drag handlers, and resize handler).
 *
 * The tape runs along the screen diagonal from lower-left to upper-right.
 * Each endpoint is independently draggable; the opposite end stays fixed.
 */

import {
  DEFAULT_TUBE_DIAMETER_CM,
  TUBE_CHECK_LINE_THICKNESS_PX,
  TUBE_BODY_GRADIENT,
  TUBE_BODY_BOX_SHADOW,
  TUBE_ENDPOINT_GRADIENT,
  TUBE_CHECK_BORDER_RADIUS_PX,
  TUBE_CHECK_EDGE_MARGIN_PX,
  MIN_TUBE_LENGTH_CM,
  TUBE_CHECK_INITIAL_LENGTH_CM,
  DOM_ID,
  Z_INDEX,
} from './objectTestConstants'

import { debugLog } from './debugLogger'

/**
 * Creates a tube check tape component that renders a draggable diagonal tape
 * for verifying tube length during paper-mode calibration.
 *
 * @param {object} config
 * @param {number} config.pxPerCm - Pixels per centimetre for the current display.
 * @param {object} config.options - Calibration options (needs calibrateDistanceTubeDiameterCm).
 * @param {function} config.isFullscreen - Returns true when the document is in fullscreen.
 * @param {function} config.forceFullscreen - Forces fullscreen mode; receives (language, RC).
 * @returns {{
 *   mount: (container: HTMLElement) => void,
 *   show: (expectedLengthCm: number, matchHalfBool: boolean) => void,
 *   hide: () => void,
 *   getEstimatedLengthCm: () => number,
 *   getTapeLengthPx: () => number,
 *   wasAdjusted: () => boolean,
 *   cleanup: () => void
 * }}
 */
export function createTubeCheckComponent(config) {
  const { pxPerCm, options, isFullscreen, forceFullscreen } = config

  // ── Dimensions ──────────────────────────────────────────────────────────────
  const tapeWidth = Math.round(
    (options.calibrateDistanceTubeDiameterCm ?? DEFAULT_TUBE_DIAMETER_CM) *
      pxPerCm,
  )
  const lineThickness = TUBE_CHECK_LINE_THICKNESS_PX

  // ── Mutable state ───────────────────────────────────────────────────────────
  let tapeLengthPx = 0
  let leftDistPx = 0
  let adjusted = false
  let active = false

  let tcDragging = false
  let tcDragTarget = null // 'left' | 'right'

  // ── DOM construction (mirrors legacy createTubeCheckTapeComponent) ─────────
  const tcContainer = document.createElement('div')
  tcContainer.id = DOM_ID.TUBE_CHECK_TAPE
  tcContainer.style.position = 'fixed'
  tcContainer.style.top = '0'
  tcContainer.style.left = '0'
  tcContainer.style.width = '100vw'
  tcContainer.style.height = '100vh'
  tcContainer.style.pointerEvents = 'none'
  tcContainer.style.zIndex = Z_INDEX.TAPE_CONTAINER
  tcContainer.style.display = 'none'

  const tcTapeBody = document.createElement('div')
  tcTapeBody.style.position = 'absolute'
  tcTapeBody.style.background = TUBE_BODY_GRADIENT
  tcTapeBody.style.border = '1px solid rgba(175, 170, 165, 0.45)'
  tcTapeBody.style.borderRadius = `${TUBE_CHECK_BORDER_RADIUS_PX}px`
  tcTapeBody.style.boxShadow = TUBE_BODY_BOX_SHADOW
  tcTapeBody.style.transformOrigin = 'left center'
  tcTapeBody.style.height = `${tapeWidth}px`
  tcTapeBody.style.pointerEvents = 'auto'
  tcTapeBody.style.cursor = 'pointer'
  tcContainer.appendChild(tcTapeBody)

  const tcLeftLine = document.createElement('div')
  tcLeftLine.style.position = 'absolute'
  tcLeftLine.style.width = `${lineThickness}px`
  tcLeftLine.style.height = `${tapeWidth}px`
  tcLeftLine.style.background = TUBE_ENDPOINT_GRADIENT
  tcLeftLine.style.borderRadius = '1px'
  tcLeftLine.style.transformOrigin = 'center center'
  tcLeftLine.style.pointerEvents = 'auto'
  tcLeftLine.style.cursor = 'pointer'
  tcLeftLine.style.zIndex = '3'
  tcContainer.appendChild(tcLeftLine)

  const tcRightLine = document.createElement('div')
  tcRightLine.style.position = 'absolute'
  tcRightLine.style.width = `${lineThickness}px`
  tcRightLine.style.height = `${tapeWidth}px`
  tcRightLine.style.background = TUBE_ENDPOINT_GRADIENT
  tcRightLine.style.borderRadius = '1px'
  tcRightLine.style.transformOrigin = 'center center'
  tcRightLine.style.pointerEvents = 'auto'
  tcRightLine.style.cursor = 'pointer'
  tcRightLine.style.zIndex = '3'
  tcContainer.appendChild(tcRightLine)

  // ── Position update (mirrors legacy updateTubeCheckTapePosition) ──────────
  /** Recomputes all element positions along the screen diagonal. */
  const updatePosition = () => {
    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPx = Math.sqrt(sw * sw + sh * sh)
    const ux = sw / diagPx
    const uy = -sh / diagPx

    const leftX = leftDistPx * ux
    const leftY = sh + leftDistPx * uy
    const rightX = leftX + tapeLengthPx * ux
    const rightY = leftY + tapeLengthPx * uy

    const angleDeg =
      Math.atan2(rightY - leftY, rightX - leftX) * (180 / Math.PI)

    const tw = tapeWidth

    tcTapeBody.style.left = `${leftX}px`
    tcTapeBody.style.top = `${leftY - tw / 2}px`
    tcTapeBody.style.width = `${tapeLengthPx}px`
    tcTapeBody.style.transform = `rotate(${angleDeg}deg)`

    const lineHeight = tw

    tcLeftLine.style.left = `${leftX}px`
    tcLeftLine.style.top = `${leftY}px`
    tcLeftLine.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`
    tcLeftLine.style.height = `${lineHeight}px`

    tcRightLine.style.left = `${rightX}px`
    tcRightLine.style.top = `${rightY}px`
    tcRightLine.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`
    tcRightLine.style.height = `${lineHeight}px`
  }

  // ── Drag handlers (mirrors legacy mousedown / mousemove / mouseup) ────────

  /** @param {MouseEvent} e */
  const handleDragStart = e => {
    if (!active) return
    if (!isFullscreen()) {
      e.preventDefault()
      forceFullscreen()
      return
    }
    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPx = Math.sqrt(sw * sw + sh * sh)
    const ux = sw / diagPx
    const uy = -sh / diagPx
    const clickDist = e.clientX * ux + (e.clientY - sh) * uy
    const midDist = leftDistPx + tapeLengthPx / 2
    tcDragTarget = clickDist < midDist ? 'left' : 'right'
    tcDragging = true
    document.body.style.cursor = 'pointer'
    e.preventDefault()
    debugLog('tubeCheck', 'drag start', tcDragTarget)
  }

  /** @param {MouseEvent} e */
  const handleDragMove = e => {
    if (!tcDragging || !active) return
    if (!isFullscreen()) {
      tcDragging = false
      document.body.style.cursor = ''
      forceFullscreen()
      return
    }
    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPx = Math.sqrt(sw * sw + sh * sh)
    const ux = sw / diagPx
    const uy = -sh / diagPx
    const mouseDist = e.clientX * ux + (e.clientY - sh) * uy
    const minLengthPx = MIN_TUBE_LENGTH_CM * pxPerCm

    if (tcDragTarget === 'left') {
      const tw = tapeWidth
      const minLeftDist = (tw / 2) * Math.max(sw / sh, sh / sw)
      const rightDist = leftDistPx + tapeLengthPx
      const newLeftDist = Math.max(
        minLeftDist,
        Math.min(rightDist - minLengthPx, mouseDist),
      )
      tapeLengthPx = rightDist - newLeftDist
      leftDistPx = newLeftDist
    } else {
      const newRightDist = Math.max(
        leftDistPx + minLengthPx,
        Math.min(diagPx, mouseDist),
      )
      tapeLengthPx = newRightDist - leftDistPx
    }

    adjusted = true
    updatePosition()
  }

  const handleDragEnd = () => {
    if (tcDragging) {
      tcDragging = false
      document.body.style.cursor = ''
      debugLog('tubeCheck', 'drag end')
    }
  }

  /** @param {Event} _e */
  const handleResize = () => {
    if (active) {
      updatePosition()
    }
  }

  // ── Bind element-level listeners ──────────────────────────────────────────
  tcLeftLine.addEventListener('mousedown', handleDragStart)
  tcRightLine.addEventListener('mousedown', handleDragStart)
  tcTapeBody.addEventListener('mousedown', handleDragStart)

  // ── Window-level listeners (added once, removed on cleanup) ───────────────
  window.addEventListener('mousemove', handleDragMove)
  window.addEventListener('mouseup', handleDragEnd)
  window.addEventListener('resize', handleResize)

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Appends the tape container to the given parent element.
   * @param {HTMLElement} container
   */
  const mount = container => {
    container.appendChild(tcContainer)
    debugLog('tubeCheck', 'mounted')
  }

  /**
   * Resets state and shows the tape at an initial 5 cm length, positioned
   * partway along the diagonal so the expected display length would be
   * roughly centered.
   *
   * @param {number} expectedLengthCm - The expected tube length in cm.
   * @param {boolean} matchHalfBool - Whether we are matching half the length.
   */
  const show = (expectedLengthCm, matchHalfBool) => {
    adjusted = false
    active = true

    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPxInit = Math.sqrt(sw * sw + sh * sh)
    const expectedDisplayCm = matchHalfBool
      ? expectedLengthCm / 2
      : expectedLengthCm
    const expectedDisplayPx = expectedDisplayCm * pxPerCm
    const centeredLeftDist = (diagPxInit - expectedDisplayPx) / 2

    const edgeMargin = TUBE_CHECK_EDGE_MARGIN_PX
    const minDiagDist = Math.max(
      (edgeMargin * diagPxInit) / sw,
      (edgeMargin * diagPxInit) / sh,
    )
    const clampedCenteredLeftDist = Math.max(minDiagDist, centeredLeftDist)

    const twInit = tapeWidth
    const minLeftDistInit = (twInit / 2) * Math.max(sw / sh, sh / sw)
    leftDistPx = Math.max(minLeftDistInit, clampedCenteredLeftDist / 2)
    tapeLengthPx = TUBE_CHECK_INITIAL_LENGTH_CM * pxPerCm

    updatePosition()
    tcContainer.style.display = 'block'
    debugLog('tubeCheck', 'show', { expectedLengthCm, matchHalfBool })
  }

  /** Hides the tape and deactivates drag handling. */
  const hide = () => {
    tcContainer.style.display = 'none'
    active = false
    if (tcDragging) {
      tcDragging = false
      document.body.style.cursor = ''
    }
  }

  /**
   * Returns the estimated tube length in cm based on the current tape length.
   * @returns {number}
   */
  const getEstimatedLengthCm = () => tapeLengthPx / pxPerCm

  /**
   * Returns the current tape length in pixels.
   * @returns {number}
   */
  const getTapeLengthPx = () => tapeLengthPx

  /**
   * Returns whether the user has adjusted the tape since the last show().
   * @returns {boolean}
   */
  const wasAdjusted = () => adjusted

  /**
   * Removes all window-level event listeners and detaches the container
   * from the DOM.
   */
  const cleanup = () => {
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
    window.removeEventListener('resize', handleResize)
    tcLeftLine.removeEventListener('mousedown', handleDragStart)
    tcRightLine.removeEventListener('mousedown', handleDragStart)
    tcTapeBody.removeEventListener('mousedown', handleDragStart)
    tcContainer.remove()
    debugLog('tubeCheck', 'cleaned up')
  }

  return {
    mount,
    show,
    hide,
    getEstimatedLengthCm,
    getTapeLengthPx,
    wasAdjusted,
    cleanup,
  }
}
