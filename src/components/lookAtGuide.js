import { constrain } from './utils'

export class LookAtGuide {
  constructor(RC, parent, centerPosition, content) {
    this.RC = RC
    this.parent = parent

    this._buildElement(centerPosition, content)
  }

  moveTo(centerPosition) {
    this.centerPosition = { ...centerPosition }
    const bounding = this._size()

    this.element.style.left =
      constrain(
        this.centerPosition.x * this.RC.windowWidthPx.value -
          bounding.width / 2,
        0,
        this.RC.windowWidthPx.value - bounding.width
      ) + 'px'
    this.element.style.top =
      constrain(
        this.centerPosition.y * this.RC.windowHeightPx.value -
          bounding.height / 2,
        0,
        this.RC.windowHeightPx.value - bounding.height
      ) + 'px'
  }

  contentTo(content) {
    this.element.innerHTML = content
  }

  show() {
    this.element.style.display = 'block'
  }

  hide() {
    this.element.style.display = 'hide'
  }

  remove() {
    window.removeEventListener('resize', this._windowResizeHandler)
    this._windowResizeHandler = undefined

    this.parent.removeChild(this.element)
  }

  _buildElement(centerPosition, content) {
    this.element = document.createElement('div')
    this.element.className = 'rc-look-at-guide'

    this.parent.appendChild(this.element)

    window.addEventListener(
      'resize',
      (this._windowResizeHandler = () => {
        this.moveTo(this.centerPosition)
      })
    )

    this.show()
    this.contentTo(content)
    this.moveTo(centerPosition)
  }

  _size() {
    return this.element.getBoundingClientRect()
  }
}
