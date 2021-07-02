# RemoteCalibrator [ 🐛 WIP]

[![npm version](https://badge.fury.io/js/remote-calibrator.svg)](https://badge.fury.io/js/remote-calibrator)
[![GitHub license](https://img.shields.io/github/license/peilingjiang/RemoteCalibrator)](https://github.com/peilingjiang/RemoteCalibrator/blob/main/LICENSE)

Welcome to RemoteCalibrator! This package contains several useful tools to calibrate and track for the remote psychophysics experiments, e.g. crowd-sourced through Amazon Mechanical Turk.

The features/functions marked with 🚧 is still work-in-progress and not available yet.

## Demo

Please visit https://calibrator.app for the demo.

## Getting Started

To use RemoteCalibrator, you can either add the script (the file is in `lib` folder in this repository) directly to your HTML file.

```html
<script src="RemoteCalibrator.min.js"></script>
<!-- Or use CDN -->
<script src="https://cdn.jsdelivr.net/npm/remote-calibrator@latest/lib/RemoteCalibrator.min.js"></script>
```

Or use package management tools, e.g. NPM.

```
npm i remote-calibrator
```

And import the package to your project

```js
import RemoteCalibrator from 'remote-calibrator'
```

Then, you will be able to use functions listed below under `RemoteCalibrator`. For example,

```js
RemoteCalibrator.init({ id: 'subj_022' })
RemoteCalibrator.measureDistance({}, data => {
  console.log(`The viewing distance is ${data.value}cm.`)
})
```

You may now dive into the documentation of the functions. Arguments in square brackets are optional, e.g. `init([options, [callback]])` means both `options` configuration and the `callback` function are optional, while you have to put a `options` if you want to call the callback function. The default values of `options` are listed in each section with explanation.

## Functions

If you don't want to use the default panel and want to integrate the process into your experiment, you can also call each calibration function individually. Please see the instructions below.

### 🎬 Initialize

```js
.init([options, [callback]])
```

Initialize RemoteCalibrator. Must be called before any other functions and can only run once. Return `this`.

Pass `{ value, timestamp }` (equivalent to `RemoteCalibrator.id`) to callback.

```js
// [options] Default value
{
  /**
   * The id of the session, a string
   * Will be attached to all the data from calibration
   * A random one will be generated if no value is passed into the function
   */
  id: ...,
  // Enter fullscreen if set to true
  // Will be ignored if already in fullscreen mode
  fullscreen: false,
}
```

The callback function will be called after the initialization. Like many other functions below, one argument **(an object)** will be passed into it then. Please see the example.

```js
function initializationFinished(data) {
  // data: { timestamp, id }
  console.log(`RemoteCalibrator was initialized at ${data.timestamp}.`)
}

let options = { id: 'session_022' }
RemoteCalibrator.init(options, initializationFinished)
```

If you do not want to change anything in default options, simply use an empty object like this:

```js
RemoteCalibrator.init({}, initializationFinished)
```

The `data` passed into the callback function is an [object](https://www.w3schools.com/js/js_objects.asp) with two fields: `timestamp` and `id`. The `timestamp` is an JavaScript `Date()` object with all the information from the year to the millisecond. You can find how to get these information [here](https://www.w3schools.com/jsref/jsref_obj_date.asp).

### 🖥️ Screen

#### Measure Display Pixels

```js
.displaySize([callback])
```

Get the display width and height in pixels. This is just a wrapper of vanilla JavaScript's `window.innerWidth`, `window.screenWidth`, etc.

Pass `{ value: { displayWidthPX, displayHeightPX, windowWidthPX, windowHeightPX }, timestamp }` to callback.

#### Measure Screen Size

```js
.screenSize([options, [callback]])
```

Get the screen width and height in centimeters. Like many other calibration functions, this function will pop an overlay interface for participants to use. The callback function will be called after the calibration process (the participant presses SPACE in this case).

Pass `{ value: { screenWidthCM, screenHeightCM, screenDiagonalCM, screenDiagonalIN, screenPPI, screenPhysicalPPI }, timestamp }` to callback. `screenPPI` relates to the pixel data used in JavaScript, and `screenPhysicalPPI` is the [actual PPI](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) of some Retina displays.

```js
// [options] Default value
{
  // Automatically enter fullscreen when starting calibration
  // Will be ignored if already in fullscreen mode
  fullscreen: false,
  // Automatically quit fullscreen when calibration finished
  quitFullscreenOnFinished: false, 🚧
  // How many times the participant needs to calibrate
  repeatTesting: 1,
  // The length  decimal place of the returned value
  decimalPlace: 1,
  // Headline on the calibration page (Support HTML)
  headline: "🖥️ Screen Size Calibration",
  // Description and instruction shown in the alert popup (Support HTML)
  description: "We'll measure your physical screen size. To do this, please find a <b>standard credit card</b> (or driver's license) or a <b>USB connector</b>, place it on the screen and drag the slider to match the sizes of the physical and displayed objects. Press <b>SPACE</b> to confirm and submit when aligned.",
  // Short description shown in the calibration page (Support HTML)
  shortDescription: "Match the sizes and press <b>SPACE</b> to confirm."
}
```

### 📏 Viewing Distance

Before measuring or tracking viewing distance, calibration of the screen size is required to get the accurate value.

#### Measure

```js
.measureDistance([options, [callback]])
```

Not recommended. Pop an interface for participants to calibrate the viewing distance at the moment using Blind Spot Test.

Pass `{ value, timestamp, method }` (equivalent to `RemoteCalibrator.viewingDistanceCM`) to callback.

```js
// [options] Default value
{
  fullscreen: false,
  quitFullscreenOnFinished: false, 🚧
  // How many times each of the eye will be used to test
  // By default, right eye 2 times, then left eye 2 times
  repeatTesting: 2,
  decimalPlace: 2,
  headline: "📏 Viewing Distance Calibration",
  description: "We'll measure your viewing distance. To do this, we'll perform a blind spot test. Cover or close your left eye and focus on the black cross. Press <b>SPACE</b> when the red circle disappears. If it doesn't disappear, you may have to move closer to the screen.",
}
```

#### Track

```js
.trackDistance([options, [callback]])
```

Measure the viewing distance and then predict the real-time distance based on the change of the interpupillary distance, measured by [face landmarks](https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection).

Pass `{ value, timestamp, method }` (equivalent to `RemoteCalibrator.viewingDistanceCM`) to callback.

`method` can be either `"Blind Spot"` (for measures from blind spot tests) or `"Facemesh Predict"` (for later dynamic estimates).

```js
// [options] Default value
{
  fullscreen: false,
  repeatTesting: 2,
  pipWidthPX: 208,
  showVideo: true,
  showFaceOverlay: false,
  decimalPlace: 2,
  // Measurement per second
  trackingRate: 3,
  headline: "👀 Calibrate Gaze",
  description: "We will measure your gaze accuracy. Please do not move the mouse and look at the fixation at the middle of the screen fot eh next 5 seconds.",
}
```

### 👀 Gaze

#### Start Tracking

```js
.trackGaze([options, [callback]])
```

Use [WebGazer](https://github.com/peilingjiang-DEV/WebGazer). Pop an interface for participants to calibrate their gaze position on the screen (only when this function is called for the first time), then run in the background and continuously predict the current gaze position. Require access to the camera of the participant's computer. The callback function will be executed repeatedly **every time** there's a new prediction.

This function should only be called once, unless you want to change the callback functions for every prediction.

Pass `{ value: { x, y }, timestamp }` (equivalent to `RemoteCalibrator.gazePositionPX`) to callback.

```js
// [options] Default value
{
  fullscreen: false,
  // Draw the current gaze position on the screen (as a dot)
  showGazer: true,
  // Stop or not calibrating after the calibration process
  greedyLearner: true, 🚧
  // Show the video of the participant at the left bottom corner
  showVideo: true,
  // Picture in picture video width in pixels
  pipWidthPX: 208,
  // Show the face mesh
  showFaceOverlay: false,
  // How many times participant needs to click on each of the calibration dot
  calibrationCount: 5,
  // Min accuracy required in degree, set to "none" to pass the accuracy check
  thresholdDEG: 10,
  decimalPlace: 1, // As the system itself has a high prediction error, it's not necessary to be too precise here
  headline: "👀 Calibrate Gaze",
  description:
    "With your help, we’ll track your gaze. When asked, please grant permission to access your camera. Please try to keep your face centered in the live video feed. Follow the instructions below.",
}
```

#### Pause Tracking

```js
.pauseGaze()
```

#### Resume Tracking

```js
.resumeGaze()
```

#### End Tracking 🚧

```js
.endGaze()
```

#### Calibrate

```js
.calibrateGaze([options, [callback]])
```

Pop an interface for participants to calibrate their gaze position on the screen. Participants need to click on the dots around the screen for several times each. This function is automatically called in the `.trackGaze()` function when it's called for the first time, but you can always call this function directly as needed, e.g., when the gaze accuracy is low.

```js
// [options] Default value
{
  // How many times participant needs to click on each of the calibration dot
  calibrationCount: 5,
  headline: "👀 Calibrate Gaze",
  description:
    "With your help, we’ll track your gaze. When asked, please grant permission to access your camera. Please try to keep your face centered in the live video feed. Follow the instructions below.",
}
```

#### Get Accuracy

```js
.getGazeAccuracy([callback])
```

#### Others

- `.gazeLearning([Boolean])`
- `.showGazer([Boolean])`
- `.showVideo([Boolean])`
- `.showFaceOverlay([Boolean])`

### 📷 Webcam

```js
.webcam([callback])
```

To get the information of the webcam, RemoteCalibrator will activate the webcam, take a picture, and extract the EXIF meta data from the image file. 🚧

Pass `{ value: { subjectDistance, ... }, timestamp }`

### 💻 Environment

```js
.environment([callback])
```

Get the setup information of the experiment, including browser type, device model, operating system family and version, etc. This function does not create its own timestamp, but use the one associated with `id`, i.e. the one created when `init()` is called.

Pass `{ value: { browser, browserVersion, model, manufacturer, engine, system, systemFamily, description, fullDescription }, timestamp }` to callback.

### 📔 Other Functions

- `.checkInitialized()` Check if the model is initialized. Return a boolean.

### 💄 Customization

- `.backgroundColor` Set the color of the background. Default `#dddddd`. 🚧
- `.videoOpacity` Set the opacity of the video element (in `trackDistance` and `trackGaze`). Default `0.8`. 🚧

### 🎣 Getters

Get the value directly.

Getters will get `null` if no data can be found, i.e. the corresponding function is never called. The values returned **by the getter** will be wrapped in an object with its corresponding timestamp. Thus, to get the value, add `.value`, e.g. `RemoteCalibrator.viewingDistanceCM.value` (and use `RemoteCalibrator.viewingDistanceCM.timestamp` to get the corresponding timestamp).

#### Experiment

- `.id` The id of the subject. The associated timestamp is the one created at initiation, i.e. when `init()` is called.
- `.displayWidthPX` `.displayHeightPX` `.windowWidthPX` `.windowHeightPX` The display (and window) width and height in pixels.
- `.screenWidthCM` `.screenHeightCM` `.screenDiagonalCM` `.screenDiagonalIN` `.screenPPI` `.screenPhysicalPPI` The physical screen size and monitor PPI in centimeters.
- `.viewingDistanceCM` The last measured viewing distance.
- `.gazePositionPX` The last measured gaze position on the screen.

#### Environment

The associated timestamp of the following items is the one created at initiation, i.e. when `init()` is called.

- `.browser` The browser type, e.g. `Safari`, `Chrome`.
- `.browserVersion` The browser version.
- `.deviceType` The type of device, e.g. `desktop`.
- `.model` The model type of the device, e.g. `iPad`.
- `.manufacturer` The device manufacturer.
- `.engine` The browser engine, e.g. `Webkit`.
- `.system` The device operating system, e.g. `OS X 11.2.1 64-bit`.
- `.systemFamily` The family name of the device OS, e.g. `OS X`.
- `.description` A tidy description of the current environment, e.g. `Chrome 89.0.4389.90 on OS X 11.2.1 64-bit`.
- `.fullDescription` The full description of the current environment.

#### Others

- `.version` The RemoteCalibrator version.

## Development

[![Netlify Status](https://api.netlify.com/api/v1/badges/d043b1d3-5e60-474a-9a34-a929fba58375/deploy-status)](https://app.netlify.com/sites/b5-editor/deploys)

For building the library locally or development, please follow the steps below.

### Setup

```
git clone --recurse-submodules https://github.com/peilingjiang/RemoteCalibrator.git
```

### Install

```
npm run setup
```

### Development Build

```
npm run dev
```

This command will give you a quick and continuous build of the package output into the `example/lib` folder. Then you may setup the local server (in another Terminal window) and develop based on it.

### Example

```
npm run serve
```

This will start a local server hosting the example page. You may then access the example at `localhost:8000`.

### Build

```
npm run build
```

This command will give you a minimized build of the package output into both of the `example/lib` and `lib` folders. You may use the file for production purposes.

## References

1. Li, Q., Joo, S.J., Yeatman, J.D. et al. Controlling for Participants’ Viewing Distance in Large-Scale, Psychophysical Online Experiments Using a Virtual Chinrest. Sci Rep 10, 904 (2020). https://doi.org/10.1038/s41598-019-57204-1
2. Alexandra Papoutsaki, Patsorn Sangkloy, James Laskey, Nediyana Daskalova, Jeff Huang, & James Hays (2016). WebGazer: Scalable Webcam Eye Tracking Using User Interactions. In Proceedings of the 25th International Joint Conference on Artificial Intelligence (IJCAI) (pp. 3839–3845).
