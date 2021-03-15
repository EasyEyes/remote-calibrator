const config = {
  mode: 'production',
  entry: './src',
  module: {
    rules: [
      {
        test: /\.js/,
        use: 'babel-loader',
        include: __dirname + 'src',
        // exclude: __dirname + 'src/library',
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
}

const output = {
  filename: 'main.js',
  library: 'calibration',
  libraryTarget: 'umd',
}

const exampleConfig = Object.assign({}, config, {
  output: Object.assign({}, output, {
    path: __dirname + '/example/lib',
  }),
  optimization: {
    minimize: false,
  },
})

const libConfig = Object.assign({}, config, {
  output: Object.assign({}, output, {
    path: __dirname + '/lib',
  }),
})

module.exports = [exampleConfig, libConfig]
