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
    PPI_DONT_USE: 127.7,
    PD_DONT_USE: 6.4,
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
  IN_TO_CM: 2.54,
  UNITS: {
    CM: 'cm',
    IN_D: 'inDecimal',
    IN_F: 'inFractional',
  },
})
