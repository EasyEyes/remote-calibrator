import Swal from 'sweetalert2/dist/sweetalert2.js'

import RemoteCalibrator from './core'
import { toFixedNumber, blurAll, remap } from './helpers'

import Card from './media/card.svg'
import Arrow from './media/arrow.svg'
import USBA from './media/usba.svg'
import USBC from './media/usbc.svg'
import { bindKeys, unbindKeys } from './components/keyBinder'
import { swalInfoOptions } from './components/swalOptions'
import text from './text.json'

const resources = {
  card: Card,
  arrow: Arrow,
  usba: USBA,
  usbc: USBC,
}

const widthDataIN = {
  card: 3.375, // 85.6mm
  usba: 0.787402, // 20mm (12mm head)
  usbc: 0.787402, // 20mm (8.25mm head)
}

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
      fullscreen: false,
      quitFullscreenOnFinished: false,
      repeatTesting: 1,
      decimalPlace: 1,
      headline: text.screenSize.headline,
      description: text.screenSize.description,
      shortDescription: text.screenSize.shortDescription,
    },
    options
  )

  this.getFullscreen(options.fullscreen)

  options.shortDescription += `<br /><b>I have a <select id="matching-obj"><option value="card" selected>Credit Card</option><option value="usba">USB Type-A Connector</option><option value="usbc">USB Type-C Connector</option></select> with me.</b>`

  this._addBackground()

  Swal.fire({
    ...swalInfoOptions,
    // title: options.headline,
    html: options.description,
  }).then(() => {
    this._addBackgroundText(options.headline, options.shortDescription)
    getSize(this, this.background, options, callback)
  })

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
  sliderElement.value = 40
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

  // Add all objects
  const elements = addMatchingObj(['card', 'arrow', 'usba', 'usbc'], parent)

  // Switch OBJ
  let currentMatchingObj = 'card' // DEFAULT
  document.getElementById('matching-obj').addEventListener('change', e => {
    switchMatchingObj(e.target.value, elements)
    currentMatchingObj = e.target.value
  })
  switchMatchingObj('card', elements)

  // Card & Arrow
  let arrowFillElement = document.getElementById('size-arrow-fill')
  arrowFillElement.setAttribute('fill', '#aaa')
  let arrowSizes = {
    width: elements.arrow.getBoundingClientRect().width,
    height: elements.arrow.getBoundingClientRect().height,
  }

  const setSizes = () => {
    setCardSizes(sliderElement, elements.card, elements.arrow, arrowSizes)
    setConnectorSizes(sliderElement, elements.usba)
    setConnectorSizes(sliderElement, elements.usbc)
  }
  setSizes()

  const onSliderInput = () => {
    setSizes()
  }
  const resizeObserver = new ResizeObserver(() => {
    setSizes()
  })
  resizeObserver.observe(parent)

  // Call when ESC pressed
  const breakFunction = () => {
    document.removeEventListener('mousedown', onMouseDown, false)
    document.removeEventListener('input', onSliderInput, false)
    resizeObserver.unobserve(parent)
    RC._removeBackground()

    // Unbind keys
    unbindKeys(bindKeysFunction)
  }

  // Call when SPACE pressed
  // ! RETURN & BREAK
  const finishFunction = () => {
    let eleWidth =
      elements[currentMatchingObj].getBoundingClientRect().width ||
      parseInt(elements[currentMatchingObj].style.width) // Pixel

    let ppi = eleWidth / widthDataIN[currentMatchingObj]

    const toFixedN = options.decimalPlace

    // ! Get screen data
    const screenData = _getScreenData(ppi, toFixedN)
    // ! Record data
    RC.screenData = screenData

    // Remove listeners and DOM
    breakFunction()

    // ! Call the callback function
    if (callback) callback(screenData)
    return
  }

  sliderElement.addEventListener('input', onSliderInput, false)
  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    ' ': finishFunction,
  })
}

const setCardSizes = (slider, card, arrow, aS) => {
  // Card
  card.style.width =
    (slider.offsetWidth - 30) * (slider.value / 100) + 15 + 'px'
  // Arrow
  let cardSizes = card.getBoundingClientRect()
  arrow.style.left = cardSizes.left + cardSizes.width + 'px'
  arrow.style.top = cardSizes.top + (cardSizes.height - aS.height) / 2 + 'px'
}

const setConnectorSizes = (slider, connector) => {
  connector.style.width = remap(slider.value, 0, 100, 10, 500) + 'px'
}

const addMatchingObj = (names, parent) => {
  // Remove all elements from the page first
  let oldElements = document.getElementsByClassName('size-obj')
  while (oldElements.length) {
    oldElements[0].parentNode.removeChild(oldElements[0])
  }

  const elements = {}

  for (let name of names) {
    let element = document.createElement('div')
    parent.appendChild(element)
    element.outerHTML = resources[name]
    element = document.getElementById('size-' + name)
    element.setAttribute('preserveAspectRatio', 'none')
    element.style.display = 'none'
    elements[name] = element
  }

  return elements
}

const switchMatchingObj = (name, elements) => {
  for (let obj in elements) {
    if (obj === name) elements[obj].style.display = 'block'
    else elements[obj].style.display = 'none'
  }
  if (name === 'card') elements.arrow.style.display = 'block'
  else elements.arrow.style.display = 'none'
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
