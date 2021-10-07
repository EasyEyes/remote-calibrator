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
    CLICK_TYPE: {
      MOUSE: 'mouse',
      TOUCH: 'touch',
    },
  },
  COLOR: {
    ORANGE: '#ff9a00',
    DARK_RED: '#ac0d0d',
  },
  CREDIT_TEXT: {
    BLIND_SPOT_TEST: `As suggested by the Li et al. (2020) "Virtual Chinrest" paper.`,
    CREDIT_CARD: `Credit card suggested by the Li et al. (2020) "Virtual Chinrest" paper.`,
  },
})
