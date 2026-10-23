
// declaring the express server
const express = require('express')
const path = require('path')
const app = express()
const usersRouter = express.Router()

// mount the route
app.use('/api/student', usersRouter)
app.use(express.json())

// testing the server
app.use((req,res) => {
  console.log(`incoming request: ${req.method} ${res.url}`)
  next()
})