const path = require('path')

const webpack = require('webpack')

const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const packageJSON = require('../package.json')
const config = require('../webpack.utils.js').config
const plugins = require('../webpack.utils.js').plugins

module.exports = {
  ...config,
  mode: 'production',
  target: 'node',
  entry: './test/index.test.js',
  output: {
    // eslint-disable-next-line no-undef
    path: path.resolve(__dirname, '../test-exec'),
    filename: 'test.min.js',
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    ...plugins,
    new CleanWebpackPlugin(),
    new NodePolyfillPlugin(),
    new webpack.IgnorePlugin({
      resourceRegExp: /^canvas$/,
    }),
    new webpack.DefinePlugin({
      'process.env.VERSION': JSON.stringify(packageJSON.version),
      'process.env.BUILD_TARGET': JSON.stringify('mocha'),
    }),
  ],
  devtool: 'inline-source-map',
}
