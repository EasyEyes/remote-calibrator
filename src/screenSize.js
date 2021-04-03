import RemoteCalibrator from './core'
import {
  getFullscreen,
  removeBackground,
  addBackground,
  constructInstructions,
  toFixedNumber,
  blurAll,
} from './helpers'
import { debug } from './constants'

import Card from './media/card.svg'
import Arrow from './media/arrow.svg'

RemoteCalibrator.prototype.screenSize = function (options = {}, callback) {
  /**
   *
   * options -
   *
   * fullscreen: [Boolean]
   * quitFullscreenOnFinished: [Boolean] // TODO
   * repeatTesting: 1 // TODO
   * decimalPlace: [Number] Default 1
   * headline: [String]
   * description: [String]
   *
   */
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  options = Object.assign(
    {
      fullscreen: true,
      quitFullscreenOnFinished: false,
      repeatTesting: 1,
      decimalPlace: 1,
      headline: '🖥️ Screen Size Calibration',
      description: `We'll measure your physical screen size. To do this, please find a <b>standard credit (or debit) card</b>, \nplace it on the screen and align the top and left edges with those of the picture, and drag the slider \nto match the other two edges. Press <b>SPACE</b> to confirm and submit the alignment.`,
    },
    options
  )

  if (options.fullscreen && !debug) getFullscreen()

  let sizeDiv = addBackground(
    constructInstructions(options.headline, options.description)
  )

  getSize(this, sizeDiv, options, callback)
  return
}

function getSize(RC, parent, options, callback) {
  // Slider
  const sliderElement = document.createElement('input')
  sliderElement.id = 'size-slider'
  sliderElement.className = 'slider'
  sliderElement.type = 'range'
  sliderElement.min = 0
  sliderElement.max = 100
  sliderElement.value = 50
  sliderElement.step = 0.1
  parent.appendChild(sliderElement)

  const onMouseDown = e => {
    if (
      e.target.className === 'slider' &&
      e.target.id === 'size-slider' &&
      e.which === 1
    ) {
      e.target.style.cursor = 'grabbing'
      arrowFillElement.setAttribute('fill', '#ac0d0d')
      document.addEventListener(
        'mouseup',
        function _onMouseUp() {
          sliderElement.style.cursor = 'grab'
          arrowFillElement.setAttribute('fill', '#aaa')
          document.removeEventListener('mouseup', _onMouseUp, false)
        },
        false
      )
    }
  }
  document.addEventListener('mousedown', onMouseDown, false)

  // Card
  let cardElement = document.createElement('div')
  parent.appendChild(cardElement)
  cardElement.outerHTML = Card
  cardElement = document.getElementById('size-card')
  cardElement.setAttribute('preserveAspectRatio', 'none')

  // Arrow
  let arrowElement = document.createElement('div')
  parent.appendChild(arrowElement)
  arrowElement.outerHTML = Arrow
  arrowElement = document.getElementById('size-arrow')
  arrowElement.setAttribute('preserveAspectRatio', 'none')

  let arrowFillElement = document.getElementById('size-arrow-fill')
  arrowFillElement.setAttribute('fill', '#aaa')

  let arrowSizes = {
    width: arrowElement.getBoundingClientRect().width,
    height: arrowElement.getBoundingClientRect().height,
  }
  setSizes(sliderElement, cardElement, arrowElement, arrowSizes)

  const onSliderInput = () => {
    setSizes(sliderElement, cardElement, arrowElement, arrowSizes)
  }

  const resizeObserver = new ResizeObserver(() => {
    setSizes(sliderElement, cardElement, arrowElement, arrowSizes)
  })
  resizeObserver.observe(parent)

  // ! RETURN & BREAK
  const onKeydown = e => {
    if (e.key === ' ') {
      e.preventDefault()

      let cardWidth =
        cardElement.getBoundingClientRect().width ||
        parseInt(cardElement.style.width) // Pixel
      let ppi = cardWidth / 3.375 // (in) === 85.6mm
      const toFixedN = options.decimalPlace

      // ! Get screen data
      const screenData = _getScreenData(ppi, toFixedN)
      // ! Record data
      RC.screenData = screenData

      // Remove listeners
      document.removeEventListener('mousedown', onMouseDown, false)
      document.removeEventListener('input', onSliderInput, false)
      document.removeEventListener('keydown', onKeydown, false)
      resizeObserver.unobserve(parent)

      // Remove DOM
      removeBackground()

      // ! Call the callback function
      if (callback) callback(screenData)
      return
    }
  }

  sliderElement.addEventListener('input', onSliderInput, false)
  document.addEventListener('keydown', onKeydown, false)
}

const setSizes = (slider, card, arrow, aS) => {
  // Card
  card.style.width =
    (slider.offsetWidth - 30) * (slider.value / 100) + 15 + 'px'
  // Arrow
  let cardSizes = card.getBoundingClientRect()
  arrow.style.left = cardSizes.left + cardSizes.width + 'px'
  arrow.style.top = cardSizes.top + (cardSizes.height - aS.height) / 2 + 'px'
}

/**
 *
 * Get all screen data from known ppi
 *
 */
const _getScreenData = (ppi, toFixedN) => {
  const screenData = {
    value: {
      screenWidthCM: toFixedNumber(
        (2.54 * window.screen.width) / ppi,
        toFixedN
      ),
      screenHeightCM: toFixedNumber(
        (2.54 * window.screen.height) / ppi,
        toFixedN
      ),
      screenPhysicalPPI: toFixedNumber(ppi * window.devicePixelRatio, toFixedN),
      screenPPI: toFixedNumber(ppi, toFixedN),
    },
    timestamp: new Date(),
  }
  screenData.value.screenDiagonalCM = toFixedNumber(
    Math.hypot(screenData.value.screenWidthCM, screenData.value.screenHeightCM),
    toFixedN
  )
  screenData.value.screenDiagonalIN = toFixedNumber(
    screenData.value.screenDiagonalCM / 2.54,
    toFixedN
  )

  return screenData
}
