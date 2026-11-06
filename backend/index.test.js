const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const app = require('./index')
const lessons = require('./lessons')

let server
let baseUrl
let databaseLessons

function createTestCollection(documents) {
  return {
    find() {
      return {
        toArray: async () => documents.map((lesson) => ({ ...lesson }))
      }
    },
    async updateOne(filter, update) {
      const lesson = documents.find((item) => item.id === filter.id)
      if (!lesson || (filter.availableSeats && lesson.availableSeats <= filter.availableSeats.$gt)) {
        return { matchedCount: 0 }
      }

      lesson.availableSeats += update.$inc.availableSeats
      return { matchedCount: 1 }
    }
  }
}

before(async () => {
  databaseLessons = lessons.map((lesson) => ({ ...lesson }))
  databaseLessons[0].title = 'MongoDB-backed algebra lesson'
  app.locals.lessonsCollection = createTestCollection(databaseLessons)
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  delete app.locals.lessonsCollection
})

test('cart checkout decrements seats and clears the cart', async () => {
  const cartId = `test-cart-${Date.now()}`
  const lesson = lessons[0]
  const initialSeats = lesson.availableSeats

  const homeResponse = await fetch(baseUrl)
  assert.equal(homeResponse.status, 200)
  assert.match(await homeResponse.text(), /AftaClass/)

  const lessonsResponse = await fetch(`${baseUrl}/api/lessons`)
  assert.equal(lessonsResponse.status, 200)
  const fetchedLessons = await lessonsResponse.json()
  assert.equal(fetchedLessons[0].availableSeats, initialSeats)
  assert.equal(fetchedLessons[0].title, 'MongoDB-backed algebra lesson')
  assert.equal(fetchedLessons[0].imageUrl, lessons[0].imageUrl)

  const corsResponse = await fetch(`${baseUrl}/api/lessons`, {
    headers: { Origin: 'http://127.0.0.1:5501' }
  })
  assert.equal(corsResponse.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5501')

  const cartCorsResponse = await fetch(`${baseUrl}/api/cart/${cartId}`, {
    headers: { Origin: 'http://localhost:5501' }
  })
  assert.equal(cartCorsResponse.status, 200)
  assert.equal(cartCorsResponse.headers.get('access-control-allow-origin'), 'http://localhost:5501')

  const preflightResponse = await fetch(`${baseUrl}/api/cart/${cartId}/items`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:5501',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  })
  assert.equal(preflightResponse.status, 204)
  assert.equal(preflightResponse.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5501')

  const addResponse = await fetch(`${baseUrl}/api/cart/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId: lesson.id })
  })
  assert.equal(addResponse.status, 201)
  assert.equal((await addResponse.json()).items.length, 1)

  const duplicateAddResponse = await fetch(`${baseUrl}/api/cart/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId: lesson.id })
  })
  assert.equal((await duplicateAddResponse.json()).items.length, 1)

  const emptyNameResponse = await fetch(`${baseUrl}/api/checkout/${cartId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: '  ' })
  })
  assert.equal(emptyNameResponse.status, 400)

  const missingBodyResponse = await fetch(`${baseUrl}/api/checkout/${cartId}`, { method: 'POST' })
  assert.equal(missingBodyResponse.status, 400)

  const checkoutResponse = await fetch(`${baseUrl}/api/checkout/${cartId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: '  Alex Morgan  ' })
  })
  assert.equal(checkoutResponse.status, 200)
  const order = await checkoutResponse.json()
  assert.equal(order.userName, 'Alex Morgan')
  assert.equal(order.lessons[0].remainingSeats, initialSeats - 1)
  assert.equal(databaseLessons[0].availableSeats, initialSeats - 1)

  const cartResponse = await fetch(`${baseUrl}/api/cart/${cartId}`)
  assert.deepEqual((await cartResponse.json()).items, [])
})

test('lesson endpoint reports when MongoDB is not connected', async () => {
  delete app.locals.lessonsCollection

  const response = await fetch(`${baseUrl}/api/lessons`)
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /database is not connected/i)

  app.locals.lessonsCollection = createTestCollection(databaseLessons)
})
