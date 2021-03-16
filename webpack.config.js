const config = {
  // entry: { index: './src/index.js', liveDistance: './src/distanceLive.js' },
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
  // filename: '[name].bundle.js',
  library: 'calibration',
  libraryTarget: 'umd',
}

const exampleConfig = Object.assign({}, config, {
  mode: 'development',
  output: Object.assign({}, output, {
    path: __dirname + '/example/lib',
  }),
  optimization: {
    minimize: false,
  },
})

const libConfig = Object.assign({}, config, {
  mode: 'production',
  output: Object.assign({}, output, {
    path: __dirname + '/lib',
  }),
})

module.exports = env => {
  if (env.development)
    // Export example only and not minimize
    return exampleConfig
  else if (env.production) {
    // Export both and minimize both
    exampleConfig.optimization.minimize = true
    exampleConfig.mode = 'production'
    return [exampleConfig, libConfig]
  }
}
