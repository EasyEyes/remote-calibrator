# RemoteCalibrator [ 🐛 WIP]

Welcome to RemoteCalibrator! This package contains several useful tools to calibrate and track for the remote psychophysics experiments, e.g. crowd-sourced through Amazon Mechanical Turk.

The features/functions marked with 🚧 is still work-in-progress and not available yet.

## Demo

Please visit https://remotecalibrator.netlify.app for the demo.

## Getting Started

To use RemoteCalibrator, you can either add the script (the file is in `lib` folder in this repository) directly to your HTML file.

```html
<script src="RemoteCalibrator.js"></script>
```

Or use package management tools, e.g. NPM. 🚧

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
  console.log(`The viewing distance is ${data.}cm.`)
})
```

You may now dive into the documentation of the functions. Arguments in square brackets are optional, e.g. `.init([options, [callback]])` means both `options` configuration and the `callback` function are optional, while you have to put a `options` if you want to call the callback function. The default values of `options` are listed in each section with explanation.

## Functions

### `.init([options, [callback]])`

Initialize RemoteCalibrator. Must be called before any other functions and can only run once. Return `this`.

Pass `{ value, timestamp }` (equivalent to `RemoteCalibrator.id`) to callback.

```js
// [options] Default value
{
  /**
   * The id of the subject, a string
   * Will be attached to all the data from calibration
   * A random one will be generated if no value is passed into the function
   */
  id: ...,
  // Enter fullscreen if set to true
  // Will be ignored if already in fullscreen mode
  fullscreen: true,
}
```

The callback function will be called after the initialization. Like many other functions below, one argument **(an object)** will be passed into it then. Please see the example.

```js
function initializationFinished(data) {
  // data: { timestamp, id }
  console.log(`RemoteCalibrator was initialized at ${data.timestamp}.`)
}

let options = { id: 'subj_022' }
RemoteCalibrator.init(options, initializationFinished)

// If you do not want to change anything in default options,
// simply use an empty object
// RemoteCalibrator.init({}, initializationFinished);
```

The `data` passed into the callback function is an [object](https://www.w3schools.com/js/js_objects.asp) with two fields: `timestamp` and `id`. The `timestamp` is an JavaScript `Date()` object with all the information from the year to the millisecond. You can find how to get these information [here](https://www.w3schools.com/jsref/jsref_obj_date.asp).

### 🖥️ `.displaySize([callback])`

Get the display width and height in pixels. This is just a wrapper of vanilla JavaScript's `window.innerWidth`, `window.screenWidth`, etc.

Pass `{ displayWidthPX, displayHeightPX, windowWidthPX, windowHeightPX, timestamp }` to callback.

### 🖥️ `.screenSize([options, [callback]])`

Get the screen width and height in centimeters. Like many other calibration functions, this function will pop an overlay interface for participants to use. The callback function will be called after the calibration process (the participant presses SPACE in this case).

Pass `{ screenWidthCM, screenHeightCM, screenDiagonalCM, screenDiagonalIN, screenPPI, screenPhysicalPPI, timestamp }` to callback. `screenPPI` relates to the pixel data used in JavaScript, and `screenPhysicalPPI` is the [actual PPI](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) of some Retina displays.

```js
// [options] Default value
{
  // Automatically enter fullscreen when start calibration
  // Will be ignored if already in fullscreen mode
  fullscreen: true,
  // Automatically quit fullscreen when calibration finished
  quitFullscreenOnFinished: false, 🚧
  // How many times the participant needs to calibrate
  repeatTesting: 1,
  // The length  decimal place of the returned value
  decimalPlace: 1,
  // Headline on the calibration page (Support HTML)
  headline: '🖥️ Screen Size Calibration',
  // Description and instruction on the calibration page (Support HTML)
  description: `We'll measure your physical screen size. To do this, please find a <b>standard credit (or debit) card</b>, \nplace it on the screen and align the top and left edges with those of the picture, and drag the slider \nto match the other two edges. Press <b>SPACE</b> to confirm and submit the alignment.`,
}
```

### 📏 `.measureDistance([options, [callback]])`

Not recommended. Pop an interface for participants to calibrate the viewing distance at the moment. Before measuring viewing distance, you need to calibrate the screen size first to get the accurate value.

Pass `{ value, timestamp }` (equivalent to `RemoteCalibrator.viewingDistanceCM`) to callback.

```js
// [options] Default value
{
  fullscreen: true,
  quitFullscreenOnFinished: false, 🚧
  // How many times each of the eye will be tested
  // By default, right eye 3 times, then left eye 3 times
  repeatTesting: 3,
  decimalPlace: 2,
  headline: '📏 Viewing Distance Calibration',
  description: "We'll measure your viewing distance. To do this, we'll perform a blind spot test. \nCover or close your left eye and focus on the black cross. \nPress <b>SPACE</b> when the red circle disappears. \nIf it doesn't disappear, you may have to move closer to the screen.",
}
```

### 📏 `.trackDistance([options, [callback]])`

### 👀 `gazeTracking([options, [callback]])`

Use [WebGazer](https://github.com/peilingjiang-DEV/WebGazer). Pop an interface for participants to calibrate their gaze position on the screen, then run in the background and continuously predict the current gaze position. Require access to the camera of the participant's computer.

Pass `{ x, y, timestamp }` (equivalent to `RemoteCalibrator.gazePositionPX`) to callback.

```js
// [options] Default value
{
  fullscreen: true,
  // Draw the current gaze position on the screen (as a dot)
  showGazer: true,
  // Stop or not (greedy) calibrating after the calibration process
  greedyLearner: true, 🚧
  // Show the video of the participant at the left bottom corner
  showVideo: true,
  // Picture in picture video width in pixels
  pipWidthPX: 208,
  // Show the face mesh
  showFaceOverlay: false,
  // How many times participant needs to click on each of the calibration dot
  calibrationCount: 5,
  decimalPlace: 1, // As the system itself has a high prediction error, it's not necessary to be too precise here
  headline: '👀 Live Gaze Tracking',
  description:
    "We'll keep track of your gaze position. First, we need to calibrate for the system. \nPlease enable camera access and move your body to the center so that the square becomes green. \nPlease then follow the instructions below to finish the calibration.",
}
```

### Getters

Getters will get `null` if no data can be found, i.e. the corresponding function is never called. The values returned **by the getter** will be wrapped in an object with its corresponding timestamp. Thus, to get the value, add `.value`, e.g. `RemoteCalibrator.viewingDistanceCM.value` (and use `RemoteCalibrator.viewingDistanceCM.timestamp` to get the corresponding timestamp).

- `.id` The id of the subject.
- `.displayWidthPX` `.displayHeightPX` `.windowWidthPX` `.windowHeightPX` The display (and window) width and height in pixels.
- `.screenWidthCM` `.screenHeightCM` `.screenDiagonalCM` `.screenDiagonalIN` `.screenPPI` `.screenPhysicalPPI` The physical screen size in centimeters.
- `.viewingDistanceCM` Get the latest viewing distance.
- `.gazePositionPX` Get the latest gaze position on the screen. You can access the value directly by `.x` and `.y`.

### Others

- `.checkInitialized()` Check if the model is initialized. Return a boolean.

## Development

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
node server.js
```

Then you may access the example at `localhost:8000`.

### Build

This command will give you a minimized build of the package output into both of the `example/lib` and `lib` folders. You may use the file for production purposes.

```
npm run build
```

## References

1. Li, Q., Joo, S.J., Yeatman, J.D. et al. Controlling for Participants’ Viewing Distance in Large-Scale, Psychophysical Online Experiments Using a Virtual Chinrest. Sci Rep 10, 904 (2020). https://doi.org/10.1038/s41598-019-57204-1
2. Alexandra Papoutsaki, Patsorn Sangkloy, James Laskey, Nediyana Daskalova, Jeff Huang, & James Hays (2016). WebGazer: Scalable Webcam Eye Tracking Using User Interactions. In Proceedings of the 25th International Joint Conference on Artificial Intelligence (IJCAI) (pp. 3839–3845).
