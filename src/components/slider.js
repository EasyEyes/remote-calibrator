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
  parent.appendChild(sliderElement)
  
  // Set style AFTER appending to DOM so offsetWidth is available
  setSliderStyle(sliderElement)

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
  
  // Account for thumb width to align gradient with thumb center
  // The browser's range input thumb has a specific width that we need to compensate for
  const sliderWidth = ele.offsetWidth
  
  if (!sliderWidth || sliderWidth === 0) {
    // Fallback if width not available yet
    ele.style.background = `linear-gradient(90deg, #ffc772, #ffc772 ${ratio * 100}%, #fff ${ratio * 100}%)`
    return
  }
  
  // Calculate gradient position accounting for thumb geometry
  // Using a percentage-based adjustment instead of fixed pixel values
  // The thumb occupies ~2-3% of the slider width at typical sizes
  const thumbPercentage = 2.5 // Percentage of slider occupied by thumb margins
  
  // Adjust ratio to account for thumb: scale the range and add offset
  const adjustedRatio = thumbPercentage / 2 + ratio * (100 - thumbPercentage)
  
  ele.style.background = `linear-gradient(90deg, #ffc772, #ffc772 ${adjustedRatio}%, #fff ${adjustedRatio}%)`
}
