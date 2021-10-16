import RemoteCalibrator from './core'

RemoteCalibrator.prototype._CONST = Object.freeze({
  N: {
    VIDEO_W: {
      DESKTOP: 208,
      MOBILE: 144,
    },
    VIDEO_MARGIN: '10px',
    GAZE_CALIBRATION: {
      R: 28,
      MARGIN: 10,
      BORDER: 8,
    },
  },
  S: {
    AUTO: 'AUTO',
    CLICK_TYPE: {
      MOUSE: 'mouse',
      TOUCH: 'touch',
    },
  },
  COLOR: {
    LIGHT_GREY: '#cccccc',
    ORANGE: '#ff9a00',
    DARK_RED: '#ac0d0d',
  },
  LTR: 'LTR',
  RTL: 'RTL',
  VIEW_METHOD: {
    B: 'BlindSpot',
    F: 'FaceMesh',
  },
})
