# RemoteCalibrator

Welcome to RemoteCalibrator! The features/functions marked with 🚧 is still work-in-progress and not available yet.

## Demo

Please visit https://remotecalibrator.netlify.app for the demo.

## Getting Started

To use RemoteCalibrator, you can either add the script (the file is in `lib` folder in this repository) directly to your HTML file.

```html
<script src="RemoteCalibrator.js"></script>
```

Or use package management tools, e.g. NPM. 🚧

```
npm i RemoteCalibrator
```

And import the package to your project

```js
import RemoteCalibrator from 'RemoteCalibrator'
```

Then, you will be able to use functions listed below under `RemoteCalibrator`. For example

```js
RemoteCalibrator.init({ id: 'subj_022' })
RemoteCalibrator.staticDistance(data => {
  console.log(`The viewing distance is ${data.d}cm.`)
})
```

You may now dive into the documentation of the functions. Arguments in square brackets are optional, e.g. `.init([options, [callback]])` means both `options` configuration and the `callback` function are optional, while you have to put a `options` if you want to call the callback function. The default values of `options` are listed in each section with explanation.

## Functions

### `.init([options, [callback]])`

Initialize RemoteCalibrator. Must be called before any other functions. The function has no return.

Pass `{ timestamp, id }` to callback.

```js
// [options] Default value
{
  /**
   * The id of the subject, a string
   * Will be attached to all the data from calibration
   * A random one will be generated if no value is passed into the function
   */
  id: ...,
}
```

The callback function will be called after the initialization. Like many other functions below, one argument (an object) will be passed into it then. Please see the example.

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

### `.displaySize([callback])`

Get the display width and height in pixels.

Pass `{ width, height, timestamp, id }` to callback.

### `.screenSize([options, [callback]])`

Get the screen width and height in centimeters. Like many other calibration functions, this function will pop an overlay interface for participants to use. The callback function will be called after the calibration process (the participant presses SPACE in this case).

Pass `{ width, height, timestamp, id }` to callback.

```js
// [options] Default value
{
  // Automatically enter fullscreen when start calibration
  // Will be ignored if already in fullscreen mode
  fullscreen: true,
  // Automatically quit fullscreen when calibration finished
  quitFullscreenOnFinished: false,
  // How many times you want the participant to calibrate
  repeatTesting: 1,
  // The length  decimal place of the returned value
  decimalPlace: 1,
  // Headline on the calibration page
  headline: '🖥️ Screen Size Calibration',
  // Description and instruction on the calibration page
  description: `We'll measure your physical screen size. To do this, please find a <b>standard credit (or debit) card</b>, \nplace it on the screen and align the top and left edges with those of the picture, and drag the slider \nto match the other two edges. Press <b>SPACE</b> to confirm and submit the alignment.`,
}
```

### `.staticDistance([options, [callback]])`

Not recommended. Pop an interface for participate to calibrate the viewing distance at the moment.

```js
// [options] Default value
{
  fullscreen: true,
  quitFullscreenOnFinished: false,
  // The test uses eyes in turns, so by default each eye will be tested for once
  repeatTesting: 2,
  headline: '📏 Viewing Distance Calibration',
  description: "We'll measure your viewing distance. To do this, we'll perform a <em>blind spot test</em>. \nCover or close one of your eyes and focus on the black cross. \nPress <b>SPACE</b> when the red circle disappears. \nIf it doesn't disappear, you may have to move closer or farther from the screen.",
},
```

### Getters

Getters will get `null` if no data can be found, i.e. the corresponding function is never called. All the values returned will be wrapped in an object with its corresponding timestamp. Thus, to get the value, add `.value`, e.g. `RemoteCalibrator.id.value`.

- `.id` The id of the subject.
- `.displayWidth` `.displayHeight` The display width and height in pixels.
- `.screenWidth` `.screenHeight` `.screenDiagonal` `.screenPPI` `.screenPhysicalPPI` The screen size in centimeters.
- `.viewingDistance` Get the latest viewing distance.

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

This command will give you a quick and continuous build of the package output into the `example/lib` folder. Then you may setup the local server and develop based on it.

```
npm run dev
```

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
