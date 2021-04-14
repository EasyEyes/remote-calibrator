import RemoteCalibrator from './core'

import './screenSize'
import './displaySize'
import './distance'
import './distanceTrack'

import './gaze/gaze'
import './gaze/gazeCalibration'
import GazeTracker from './gaze/gazeTracker'

import './css/main.css'
import './css/screenSize.css'
import './css/distance.css'
import './css/gaze.css'

const r = new RemoteCalibrator()
r.gazeTracker = new GazeTracker(r)

export default r
