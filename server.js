const express = require('express')
const app = express()
const PORT = process.env.PORT || 8000

app.use(express.static('example'))
app.listen(PORT, () => console.log('SERVER LISTENING ON PORT ', PORT))
