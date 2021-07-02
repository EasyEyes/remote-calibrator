const express = require('express')
const app = express()
const PORT = process.env.PORT || 8000

app.use(express.static('homepage'))
app.listen(PORT, () => console.log('SERVER LISTENING ON PORT ', PORT))
