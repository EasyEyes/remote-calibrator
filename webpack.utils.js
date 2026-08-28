const path = require('path')
const webpack = require('webpack')

// const ESLintPlugin = require('eslint-webpack-plugin')
const WebpackModules = require('webpack-modules')

// Resolve TensorFlow.js to the copy installed with the WebGazer4RC submodule
// so packages imported from the root (e.g. hand-pose-detection) share the
// same tfjs instance as FaceMesh instead of bundling a second copy.
const webgazerModules = path.resolve(__dirname, 'src/WebGazer4RC/node_modules')

const config = {
  entry: './src',
  resolve: {
    alias: {
      '@tensorflow/tfjs-core': path.join(
        webgazerModules,
        '@tensorflow/tfjs-core',
      ),
      '@tensorflow/tfjs-converter': path.join(
        webgazerModules,
        '@tensorflow/tfjs-converter',
      ),
      '@tensorflow/tfjs-backend-webgl': path.join(
        webgazerModules,
        '@tensorflow/tfjs-backend-webgl',
      ),
      '@tensorflow/tfjs-backend-cpu': path.join(
        webgazerModules,
        '@tensorflow/tfjs-backend-cpu',
      ),
      // Only the tfjs runtime is used; stub out the MediaPipe wasm runtime.
      '@mediapipe/hands': false,
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',

        // include: __dirname + 'src/*',
        exclude: /node_modules/,
      },
      {
        test: /\.mjs/,
        type: 'javascript/auto',
        use: 'babel-loader',
        exclude: /node_modules/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          'style-loader',
          'css-loader',
          'postcss-loader',
          {
            loader: 'sass-loader',
            options: {
              implementation: require('sass'),
            },
          },
        ],
      },
      {
        test: /\.svg$/,
        loader: 'svg-inline-loader',
      },
      {
        test: /\.(png|jpe?g|gif)$/i,
        loader: 'url-loader',
        options: {
          name: '[name].[ext]',
          outputPath: 'images',
        },
      },
      { test: /\.json$/, type: 'json' },
    ],
  },
  devtool: 'source-map',
}

const plugins = [
  new WebpackModules(),
  // new ESLintPlugin(),
  new webpack.ProgressPlugin(),
]

module.exports = { config, plugins }
