const express = require('express')
const https = require('https')
const fs = require('fs')
const app = express()
const PORT = process.env.PORT || 8000

/**
 * Refer to https://github.com/sagardere/set-up-SSL-in-nodejs
 * to learn how to generate the .key and .crt files.
 */

let key = fs.readFileSync(__dirname + '/certificates/signed.key')
let cert = fs.readFileSync(__dirname + '/certificates/signed.crt')

app.use(express.static('example'))
server = https.createServer(
  {
    key: key,
    cert: cert,
  },
  app
)
server.listen(PORT, () => console.log('SERVER LISTENING ON PORT ', PORT))
