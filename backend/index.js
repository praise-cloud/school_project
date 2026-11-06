const express = require('express')
const path = require('path')
const { MongoClient } = require('mongodb')

require('dotenv').config({ path: path.join(__dirname, '.env') })

const app = express()
const carts = new Map()

app.use((req, res, next) => {
  const allowedOrigins = new Set([
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501'
  ])
  const origin = req.get('Origin')

  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
})

app.use(express.json())

app.get('/api/lessons', async (req, res) => {
  const collection = getLessonsCollection(req, res)
  if (!collection) return

  const documents = await collection.find({}).toArray()
  res.json(documents.map(({ _id, ...lesson }) => lesson).sort((a, b) => a.id - b.id))
})

app.get('/api/cart/:cartId', async (req, res) => {
  const collection = getLessonsCollection(req, res)
  if (!collection) return

  res.json({ items: await getCartItems(collection, req.params.cartId) })
})

app.post('/api/cart/:cartId/items', async (req, res) => {
  const collection = getLessonsCollection(req, res)
  if (!collection) return

  const lessonId = Number(req.body && req.body.lessonId)
  const lessons = await collection.find({}).toArray()
  const lesson = lessons.find((item) => Number(item.id) === lessonId)

  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found.' })
  }

  if (lesson.availableSeats < 1) {
    return res.status(409).json({ error: 'This lesson is fully booked.' })
  }

  const cart = carts.get(req.params.cartId) || new Set()
  cart.add(lesson.id)
  carts.set(req.params.cartId, cart)

  res.status(201).json({ items: await getCartItems(collection, req.params.cartId) })
})

app.delete('/api/cart/:cartId/items/:lessonId', async (req, res) => {
  const collection = getLessonsCollection(req, res)
  if (!collection) return

  const cart = carts.get(req.params.cartId)
  const lessonId = Number(req.params.lessonId)

  if (cart) {
    cart.delete(lessonId)
    if (cart.size === 0) carts.delete(req.params.cartId)
  }

  res.json({ items: await getCartItems(collection, req.params.cartId) })
})

app.post('/api/checkout/:cartId', async (req, res) => {
  const collection = getLessonsCollection(req, res)
  if (!collection) return

  const userName = typeof (req.body && req.body.userName) === 'string'
    ? req.body.userName.trim()
    : ''
  const cart = carts.get(req.params.cartId)

  if (!userName) {
    return res.status(400).json({ error: 'Please enter your name.' })
  }

  if (!cart || cart.size === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' })
  }

  const lessons = await collection.find({}).toArray()
  const selectedLessons = lessons.filter((lesson) => cart.has(lesson.id))
  const unavailableLesson = selectedLessons.find((lesson) => lesson.availableSeats < 1)

  if (unavailableLesson) {
    return res.status(409).json({
      error: `${unavailableLesson.title} no longer has any seats available. Remove it from your cart to continue.`
    })
  }

  const updatedLessons = []

  for (const lesson of selectedLessons) {
    const result = await collection.updateOne(
      { id: lesson.id, availableSeats: { $gt: 0 } },
      { $inc: { availableSeats: -1 } }
    )

    if (!result.matchedCount) {
      for (const updatedLesson of updatedLessons) {
        await collection.updateOne(
          { id: updatedLesson.id },
          { $inc: { availableSeats: 1 } }
        )
      }

      return res.status(409).json({
        error: `${lesson.title} no longer has any seats available. Remove it from your cart to continue.`
      })
    }

    lesson.availableSeats -= 1
    updatedLessons.push(lesson)
  }

  carts.delete(req.params.cartId)

  res.json({
    message: 'Your lessons have been booked successfully.',
    userName,
    lessons: selectedLessons.map((lesson) => ({
      ...lesson,
      remainingSeats: lesson.availableSeats
    }))
  })
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' })
})

app.use(express.static(path.join(__dirname, '..', 'frontend')))

app.use((error, req, res, next) => {
  console.error('API request failed:', error.message)

  if (res.headersSent) {
    return next(error)
  }

  res.status(500).json({ error: 'The request could not be completed. Please try again.' })
})

function getLessonsCollection(req, res) {
  const collection = req.app.locals.lessonsCollection

  if (!collection) {
    res.status(503).json({
      error: 'The lesson database is not connected. Check MONGODB_URI and restart the backend.'
    })
    return null
  }

  return collection
}

async function getCartItems(collection, cartId) {
  const cart = carts.get(cartId) || new Set()
  const lessons = await collection.find({}).toArray()
  return lessons.filter((lesson) => cart.has(lesson.id))
}

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing. Add your connection string to backend/.env.')
  }

  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()

  app.locals.mongoClient = client
  app.locals.lessonsCollection = client.db('AftaClass').collection('lessons')

  const port = process.env.PORT || 3002
  app.listen(port, () => {
    console.log(`AftaClass connected to MongoDB database AftaClass, collection lessons`)
    console.log(`AftaClass server listening on port ${port}`)
  })
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start AftaClass backend:', error.message)
    process.exitCode = 1
  })
}

module.exports = app
