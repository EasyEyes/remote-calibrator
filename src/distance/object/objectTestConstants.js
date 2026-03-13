/**
 * objectTestConstants.js
 *
 * Consolidated magic numbers, default values, and configuration constants
 * for the object-based distance calibration test. These were previously
 * scattered as inline literals throughout the legacy objectTest function
 * in distance.js.
 */

// ─── Face Mesh Sampling ────────────────────────────────────────────────────────
export const FACE_MESH_SAMPLE_COUNT = 5
export const FACE_MESH_SAMPLE_DELAY_MS = 100

// ─── Screen / PPI ──────────────────────────────────────────────────────────────
export const FALLBACK_PPI = 96 / 25.4
export const MM_PER_INCH = 25.4
export const CM_PER_INCH = 2.54

// ─── Unit Conversion Factors ───────────────────────────────────────────────────
export const UNIT_TO_CM_FACTOR = {
  cm: 1,
  mm: 0.1,
  in: CM_PER_INCH,
  inch: CM_PER_INCH,
  inches: CM_PER_INCH,
}

// ─── Tube Check ────────────────────────────────────────────────────────────────
export const DEFAULT_TUBE_DIAMETER_CM = 3.5
export const MIN_TUBE_LENGTH_CM = 2
export const TUBE_CHECK_INITIAL_LENGTH_CM = 5
export const TUBE_CHECK_LINE_THICKNESS_PX = 3
export const TUBE_CHECK_BORDER_RADIUS_PX = 5
export const TUBE_CHECK_EDGE_MARGIN_PX = 15
export const HALF_LENGTH_SCREEN_RATIO = 0.9

// ─── Arrow Indicators ──────────────────────────────────────────────────────────
export const ARROW_SIZE_CM = 3
export const ARROW_LINE_THICKNESS_PX = 3
export const ARROWHEAD_LENGTH_RATIO = 0.35
export const ARROWHEAD_ANGLE_DEG = 30

// ─── Ruler / Tape Component ────────────────────────────────────────────────────
export const TAPE_WIDTH_INCHES = 0.75
export const TAPE_LINE_THICKNESS_PX = 3
export const HANDLE_HOTSPOT_DIVISOR = 4
export const INITIAL_RULER_LENGTH_RATIO = 0.6
export const BOTTOM_MARGIN_PX = 80
export const RULER_TICK_LENGTH_RATIO = 0.2
export const RULER_TICK_WIDTH_PX = 2
export const RULER_NUMBER_FONT_SIZE_REM = 1.8
export const RULER_LABEL_FONT_SIZE_REM = 1.0
export const RULER_LABEL_SCALE_THRESHOLD = 0.4
export const RULER_LABEL_MIN_SCALE = 0.5
export const ARROW_OFFSET_BELOW_TAPE_PX = 15
export const ARROWHEAD_LINE_WIDTH_PX = 24
export const ARROWHEAD_LINE_HEIGHT_PX = 2
export const MIN_RULER_DISTANCE_PX = 50
export const RULER_Y_MAX_MARGIN_PX = 30
export const TEXT_BOX_INITIAL_HEIGHT_PX = 50
export const LABEL_DIMENSION_DELAY_MS = 10

// ─── Ruler Interval Randomness ─────────────────────────────────────────────────
export const INTERVAL_BASE_FACTOR = 0.6
export const INTERVAL_RANDOM_AMPLITUDE = 0.4
export const INTERVAL_MIN_CM = 0.1
export const INTERVAL_HEADROOM_CM = 1

// ─── Ruler-Shift Button ────────────────────────────────────────────────────────
export const RULER_SHIFT_ANIMATION_SPEED_PX_PER_SEC = 200
export const RULER_SHIFT_TARGET_MARGIN_PX = 25
export const RULER_SHIFT_BUTTON_SIZE_PX = 100
export const RULER_SHIFT_GAP_ABOVE_RULER_PX = 25
export const RULER_SHIFT_TRANSITION_DURATION = '0.3s'
export const RULER_SHIFT_PULSE_DURATION = '2s'

// ─── Arrow Key Step Sizes ──────────────────────────────────────────────────────
export const ARROW_KEY_FAST_THRESHOLD_COUNT = 3
export const ARROW_KEY_FAST_STEP_MM = 5
export const ARROW_KEY_TAP_STEP_MM = 0.5
export const ARROW_KEY_INTERVAL_MS = 50

// ─── Object Length Thresholds ──────────────────────────────────────────────────
export const DEFAULT_MIN_OBJECT_LENGTH_CM = 10
export const DEFAULT_MIN_OBJECT_LENGTH_CM_SPACE = 30
export const DEFAULT_ALLOWED_RATIO = 1.1
export const DEFAULT_FOCAL_TOLERANCE_RATIO = 1.15
export const DEFAULT_CAMERA_WIDTH_VPX = 640

// ─── Calibration Distance Defaults ─────────────────────────────────────────────
export const DEFAULT_OFFSET_CM = 4

// ─── Stepper / Instructions ────────────────────────────────────────────────────
export const STEPPER_THRESHOLD_FRACTION = 0.6
export const STEPPER_BAR_HEIGHT_PX = 44
export const STEPPER_FILL_TARGET = 0.95
export const FIRST_BLOCKING_PRELOAD_COUNT = 3
export const RULER_SHIFT_SHOW_INDEX_FIRST = 5
export const RULER_SHIFT_SHOW_INDEX_SUBSEQUENT = 4

// ─── Timing ────────────────────────────────────────────────────────────────────
export const BLINDSPOT_TRANSITION_DELAY_MS = 500

// ─── DOM Element IDs ───────────────────────────────────────────────────────────
export const DOM_ID = {
  ARROW_INDICATORS: 'object-test-arrow-indicators',
  KNOWN_ARROW_INDICATORS: 'known-distance-test-arrow-indicators',
  TITLE: 'distance-tracking-title',
  DONT_USE_RULER_COLUMN: 'dont-use-ruler-column',
  DONT_USE_RULER_NOTE: 'paper-dont-use-ruler-note',
  PAPER_SELECTION_CONTAINER: 'paper-selection-container',
  PAPER_STEPPER_MEDIA: 'paper-stepper-media-container',
  DIAGONAL_TAPE: 'diagonal-tape-measurement-component',
  TUBE_CHECK_TAPE: 'tube-check-tape-container',
  RULER_SHIFT_BUTTON: 'ruler-shift-button',
  RULER_SHIFT_PULSE_STYLE: 'ruler-shift-pulse-style',
  RIGHT_LINE_LABEL: 'right-line-label',
  VIDEO_CONTAINER: 'webgazerVideoContainer',
  FACE_FEEDBACK_BOX: 'webgazerFaceFeedbackBox',
  SWAL_FOOTER_STYLE: 'swal2-footer-no-border-style',
  OK_BUTTON_PAGE3: 'ok-button-page3',
  NEW_OBJECT_BUTTON_PAGE3: 'new-object-button-page3',
}

// ─── Z-Index Layers ────────────────────────────────────────────────────────────
export const Z_INDEX = {
  ARROW_INDICATORS: '1000000000001',
  INSTRUCTIONS_CONTAINER: '3',
  DONT_USE_RULER: '999999999',
  RADIO_OVERLAY: '9998',
  PAPER_SELECTION: '10000000000',
  PAPER_STEPPER_MEDIA: '2147483600',
  TAPE_CONTAINER: '10',
  TAPE_BODY: '1',
  TAPE_HANDLE: '3',
  TAPE_VISUAL_LINE: '4',
  DYNAMIC_LABEL: '20',
  RULER_MARKINGS: '17',
  ARROW_CONTAINER: '18',
  RULER_SHIFT_BUTTON: '100',
  TEXT_BOX: '15',
  BUTTON_CONTAINER: '2147483647',
  MEDIA_CONTAINER: '2147483000',
  DEBUG_OVERLAY: '9999999999',
}

// ─── Paper / Ruler Fallback Options ────────────────────────────────────────────
export const PAPER_ONLY_FALLBACK_OPTIONS = [
  {
    key: 'usLegal',
    label: 'US Legal (8.5 × 14 inch)',
    lengthCm: 14 * CM_PER_INCH,
  },
  {
    key: 'usLetter',
    label: 'US Letter (8.5 × 11 inch)',
    lengthCm: 11 * CM_PER_INCH,
  },
  { key: 'a3', label: 'A3 (297 × 420 mm)', lengthCm: 42 },
  { key: 'a4', label: 'A4 (210 × 297 mm)', lengthCm: 29.7 },
  { key: 'a5', label: 'A5 (148 × 210 mm)', lengthCm: 21 },
  { key: 'none', label: 'None of the above', lengthCm: null },
]

export const PAPER_AND_RULER_FALLBACK_OPTIONS = [
  { key: 'ruler24in', label: '24 inch ruler', lengthCm: 24 * CM_PER_INCH },
  { key: 'ruler18in', label: '18 inch ruler', lengthCm: 18 * CM_PER_INCH },
  { key: 'ruler12in', label: '12 inch ruler', lengthCm: 12 * CM_PER_INCH },
  ...PAPER_ONLY_FALLBACK_OPTIONS.slice(0, 2),
  { key: 'ruler50cm', label: '50 cm  ruler', lengthCm: 50 },
  { key: 'ruler30cm', label: '30 cm  ruler', lengthCm: 30 },
  { key: 'ruler20cm', label: '20 cm ruler', lengthCm: 20 },
  ...PAPER_ONLY_FALLBACK_OPTIONS.slice(2),
]

// ─── Paper Mode Placeholder Length ─────────────────────────────────────────────
export const PAPER_MODE_PLACEHOLDER_LENGTH_CM = 27.94

// ─── Instruction Media Preload Priority ────────────────────────────────────────
export const MEDIA_PRELOAD_PRIORITY_KEYS = [
  'LL9',
  'LL1',
  'LL10',
  'LL2',
  'LL3',
  'LL4',
  'LL5',
  'LL6',
  'LL8',
  'LL7',
]

// ─── Phrase Key Mapping (bypass test_phrases timing issue) ─────────────────────
export const PHRASE_KEY_MAPPING = {
  RC_UseObjectToSetViewingDistanceTapePage1_MD:
    'RC_UseObjectToSetViewingDistanceTapeStepperPage1',
  RC_UseObjectToSetViewingDistanceRulerPage1_MD:
    'RC_UseObjectToSetViewingDistanceRulerStepperPage1',
  RC_UseObjectToSetViewingDistanceTapePage2_MD:
    'RC_UseObjectToSetViewingDistanceTapeStepperPage2',
  RC_UseObjectToSetViewingDistanceRulerPage2_MD:
    'RC_UseObjectToSetViewingDistanceRulerStepperPage2',
}

// ─── Tube Body Gradient (rolled white paper appearance) ────────────────────────
export const TUBE_BODY_GRADIENT = [
  'linear-gradient(to bottom,',
  'rgba(190, 185, 180, 0.92) 0%,',
  'rgba(215, 212, 208, 0.95) 3%,',
  'rgba(235, 233, 230, 0.97) 7%,',
  'rgba(246, 245, 243, 0.99) 13%,',
  'rgba(253, 252, 251, 1) 22%,',
  'rgba(255, 255, 255, 1) 38%,',
  'rgba(254, 254, 253, 1) 50%,',
  'rgba(255, 255, 255, 1) 62%,',
  'rgba(253, 252, 251, 1) 78%,',
  'rgba(246, 245, 243, 0.99) 87%,',
  'rgba(235, 233, 230, 0.97) 93%,',
  'rgba(215, 212, 208, 0.95) 97%,',
  'rgba(190, 185, 180, 0.92) 100%)',
].join(' ')

export const TUBE_BODY_BOX_SHADOW = [
  '0 4px 12px rgba(0, 0, 0, 0.16)',
  '0 1px 4px rgba(0, 0, 0, 0.10)',
  'inset 0 1px 1px rgba(255, 255, 255, 0.6)',
  'inset 0 -1px 1px rgba(0, 0, 0, 0.04)',
].join(', ')

export const TUBE_ENDPOINT_GRADIENT =
  'linear-gradient(to bottom, rgba(140,135,130,0.7), rgba(90,85,80,0.85) 30%, rgba(70,65,60,0.9) 50%, rgba(90,85,80,0.85) 70%, rgba(140,135,130,0.7))'
