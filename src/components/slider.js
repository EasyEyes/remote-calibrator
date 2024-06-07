export const createSlider = (parent, min, max) => {
  const sliderElement = document.createElement('input')
  sliderElement.id = 'rc-size-slider'
  sliderElement.className = 'rc-slider'
  sliderElement.type = 'range'
  sliderElement.min = min
  sliderElement.max = max
  sliderElement.value = Math.max(
    Math.min(Math.round(Math.random() * 100), 80),
    20,
  )
  sliderElement.step = 0.1

  setSliderPosition(sliderElement, parent)
  setSliderStyle(sliderElement)
  parent.appendChild(sliderElement)

  return sliderElement
}

export const setSliderPosition = (slider, parent) => {
  slider.style.top = `${
    Math.round(
      parent.querySelector('.calibration-instruction').getBoundingClientRect()
        .bottom,
    ) + 25
  }px`
}

export const setSliderStyle = ele => {
  const ratio = ele.value / ele.max
  ele.style.background = `linear-gradient(90deg, #ffc772, #ffc772 ${
    ratio * 100
  }%, #fff ${ratio * 100}%)`
}
