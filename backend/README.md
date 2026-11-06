# AftaClass backend

Run the backend from this directory with `npm start`, then open **http://127.0.0.1:3002**. AftaClass uses port 3002 by default to avoid conflicts with other local apps on ports 3000 and 3001. Express serves the frontend and API from the same origin. Do not open `frontend/index.html` directly from the file system.

If you prefer VS Code Live Server, open the `frontend` folder in the workspace and start Live Server on its `index.html`. The frontend calls the backend API on port 3002 when served from Live Server ports 5500 or 5501. If Live Server shows a directory listing or another project, use the Express URL above instead.

To use another backend port, set the `PORT` environment variable when starting the server and update the API URL in `frontend/index.js` to match.

## MongoDB setup

Copy `.env.example` to `.env` and replace `MONGODB_URI` with the connection string from your MongoDB deployment. The `.env` file is loaded by the backend and is ignored by Git; do not commit your connection string. The backend connects to the `AftaClass` database and reads lesson records from the `lessons` collection on startup. The database name is selected by the backend, so it does not need to be included in the URI.

`lessons.json` contains the lesson records, including an `imageUrl` for each lesson, as a JSON array ready for MongoDB import. To update existing records with new fields, replace the existing documents in `AftaClass.lessons` before importing; importing again without replacing them will add duplicates. `mongoimport` does not load `.env` automatically, so set the URI in the terminal first. From the `backend` directory, run:

```sh
export MONGODB_URI="your MongoDB connection string"
mongoimport --uri "$MONGODB_URI" --db AftaClass --collection lessons --file lessons.json --jsonArray
```

In PowerShell:

```powershell
$env:MONGODB_URI = "your MongoDB connection string"
mongoimport --uri $env:MONGODB_URI --db AftaClass --collection lessons --file lessons.json --jsonArray
```

Start the backend from this directory with `npm start`. It will not start if the connection string is missing or MongoDB cannot be reached; check the terminal error and your Atlas network access and database user settings.

To confirm lessons are reachable, open `http://127.0.0.1:3002/api/lessons`; it should return a JSON array.

## API

- `GET /api/lessons` — list lessons with their current `availableSeats`.
- `GET /api/cart/:cartId` — read a cart as `{ "items": [...] }`.
- `POST /api/cart/:cartId/items` — add one lesson using `{ "lessonId": 1 }`. A lesson can appear only once in a cart.
- `DELETE /api/cart/:cartId/items/:lessonId` — remove a lesson from a cart.
- `POST /api/checkout/:cartId` — book all lessons in the cart using `{ "userName": "Alex" }`. On success, returns the booked lessons with their `remainingSeats` and empties the cart.

Carts currently live in server memory. Lesson data is read from MongoDB, and successful bookings update `availableSeats` in the `lessons` collection.
