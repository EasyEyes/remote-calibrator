const webpack = require('webpack')

const ESLintPlugin = require('eslint-webpack-plugin')
const WebpackModules = require('webpack-modules')

const config = {
  entry: './src',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',
        // eslint-disable-next-line no-undef
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
  new ESLintPlugin(),
  new webpack.ProgressPlugin(),
]

module.exports = { config, plugins }
