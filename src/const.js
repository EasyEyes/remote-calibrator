import RemoteCalibrator from './core'
import { toFixedNumber } from './components/utils'

RemoteCalibrator.prototype._CONST = Object.freeze({
  N: {
    VIDEO_W: {
      DESKTOP: 208,
      MOBILE: 144,
    },
    VIDEO_MARGIN: '10px',
    VIDEO_MARGIN_BOTTOM: '40px',
    GAZE_CALIBRATION: {
      R: 40,
      MARGIN: 32,
      BORDER: 8,
      CENTER_EXTRA_CHECK_OFFSET: 2, // deg
      MID_EXTRA_CHECK_OFFSET: 6, // deg
    },
    PPI_DONT_USE: 127.7,
    PD_DONT_USE: 6.4,
    VIEW_DIST_DONT_USE: 40,
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
    RED: '#ee0000',
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

RemoteCalibrator.prototype._debuggerDefault = Object.freeze({
  date: new Date('July 20, 69 20:17:40 GMT+00:00'),
  timestamp: performance.now(),
  screenSize: {
    value: {
      screenWidthCm: 28.6,
      screenHeightCm: 17.9,
      screenPhysicalPpi: 250,
      screenPpi: 125,
      screenDiagonalCm: 33.8,
      screenDiagonalIn: 13.3,
    },
  },
  measureDistance: {
    value: 40,
    method: 'BlindSpot',
  },
  trackDistance: {
    value: {
      viewingDistanceCm: 40,
      PDCm: 6.4,
      nearPointCm: {
        x: 0,
        y: 0,
      },
      latencyMs: 50,
    },
    method: 'FaceMesh',
  },
  trackGaze: {
    value: {
      x: screen.width / 2,
      y: screen.height / 2,
      latencyMs: 50,
    },
  },
  performance: {
    value: {
      computeArrayFillMHz: toFixedNumber(500000 / 1e6, 3),
      computeRandomMHz: toFixedNumber(5000000 / 1e6, 3),
      idealFps: 60,
      stressFps: 60,
    },
  },
})
