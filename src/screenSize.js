import RemoteCalibrator from './core'
import { toFixedNumber, blurAll, remap } from './helpers'

import Card from './media/card.svg'
import Arrow from './media/arrow.svg'
import USBA from './media/usba.svg'
import USBC from './media/usbc.svg'
import { bindKeys, unbindKeys } from './components/keyBinder'
import { addButtons } from './components/buttons'
import { colorDarkRed } from './constants'
import text from './text.json'

// TODO Make it customizable
const defaultObj = 'usba'

const resources = {
  card: Card,
  arrow: Arrow,
  usba: USBA,
  usbc: USBC,
}

const widthDataIn = {
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
    },
    options
  )

  this.getFullscreen(options.fullscreen)

  options.description += `<br /><br /><b>I have a <select id="matching-obj"><option value="usba" selected>USB Type-A Connector</option><option value="usbc">USB Type-C Connector</option><option value="card">Credit Card</option></select> with me.</b>`

  this._addBackground()
  this._addBackgroundText(options.headline, options.description)

  getSize(this, this.background, options, callback)

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
  sliderElement.value = Math.max(
    Math.min(Math.round(Math.random() * 100), 80),
    20
  )
  sliderElement.step = 0.1

  setSliderPosition(sliderElement, parent)
  parent.appendChild(sliderElement)

  const onMouseDown = e => {
    if (
      e.target.className === 'slider' &&
      e.target.id === 'size-slider' &&
      e.which === 1
    ) {
      e.target.style.cursor = 'grabbing'
      arrowFillElement.setAttribute('fill', colorDarkRed)
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
  let currentMatchingObj = defaultObj // DEFAULT
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
    setSliderPosition(sliderElement, parent)
    setObjectsPosition(elements, sliderElement)
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

    let ppi = eleWidth / widthDataIn[currentMatchingObj]

    const toFixedN = options.decimalPlace

    // ! Get screen data
    const screenData = _getScreenData(ppi, toFixedN)
    // ! Record data
    RC.newScreenData = screenData

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

  addButtons(
    RC.background,
    {
      go: finishFunction,
      cancel: breakFunction,
    },
    RC.params.showCancelButton
  )

  // Set to actual default object
  switchMatchingObj(currentMatchingObj, elements)
}

const setCardSizes = (slider, card, arrow, aS) => {
  // Card
  card.style.width =
    (slider.offsetWidth - 30) *
      (slider.value / 100) *
      (window.innerWidth < 480 ? 2 : 1) +
    15 +
    'px'
  // Arrow
  let cardSizes = card.getBoundingClientRect()
  arrow.style.left = cardSizes.left + cardSizes.width + 'px'
  arrow.style.top = cardSizes.top + (cardSizes.height - aS.height) / 2 + 'px'
}

const setConnectorSizes = (slider, connector) => {
  connector.style.width =
    remap(Math.pow(slider.value, 1.5), 0, 1000, 50, 400) + 'px'
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

  setObjectsPosition(elements, document.querySelector('#size-slider'))

  return elements
}

const switchMatchingObj = (name, elements) => {
  for (let obj in elements) {
    if (obj === name) elements[obj].style.display = 'block'
    else elements[obj].style.display = 'none'
  }
  // TODO
  // if (name === 'card') elements.arrow.style.display = 'block'
  // else elements.arrow.style.display = 'none'
}

/**
 *
 * Get all screen data from known ppi
 *
 */
const _getScreenData = (ppi, toFixedN) => {
  const screenData = {
    value: {
      screenWidthCm: toFixedNumber(
        (2.54 * window.screen.width) / ppi,
        toFixedN
      ),
      screenHeightCm: toFixedNumber(
        (2.54 * window.screen.height) / ppi,
        toFixedN
      ),
      screenPhysicalPpi: toFixedNumber(ppi * window.devicePixelRatio, toFixedN),
      screenPpi: toFixedNumber(ppi, toFixedN),
    },
    timestamp: new Date(),
  }
  screenData.value.screenDiagonalCm = toFixedNumber(
    Math.hypot(screenData.value.screenWidthCm, screenData.value.screenHeightCm),
    toFixedN
  )
  screenData.value.screenDiagonalIn = toFixedNumber(
    screenData.value.screenDiagonalCm / 2.54,
    toFixedN
  )

  return screenData
}

const setSliderPosition = (slider, parent) => {
  slider.style.top =
    Math.round(
      parent.querySelector('.calibration-instruction').getBoundingClientRect()
        .bottom
    ) +
    25 +
    'px'
}

const setObjectsPosition = (objects, slider) => {
  for (let i in objects)
    objects[i].style.top = slider.getBoundingClientRect().top + 50 + 'px'
}
