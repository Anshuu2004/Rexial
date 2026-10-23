import express, { Express } from 'express';
import { configDotenv } from 'dotenv';
configDotenv();

import cors from 'cors'
import authRoutes from "./routes/authRoutes"
import quizzesRoutes from "./routes/quiz"
import quizSessionRoutes from "./routes/session"
import inviteRoutes from './routes/invite'
import { requestLogger } from './middlewares/requestLogger'

const app: Express = express()

app.use(cors({
    origin: 'https://rexial.in',
    credentials: true
}))
app.use(requestLogger)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT: String = process.env.PORT || '3000';


// routes

app.use("/api/v1/auth", authRoutes)

// quiz routes
app.use("/api/v1/quizzes", quizzesRoutes)

// quiz session routes
app.use("/api/v1/session", quizSessionRoutes)

// invite co-organizer routes:
app.use("/api/v1", inviteRoutes)



// Node 22 exits on an unhandled rejection, taking every in-flight request
// with it. Express 5 already catches rejections from route handlers, so this
// is a backstop for anything outside a request, not a substitute for handling
// errors where they happen.
process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandled rejection', reason)
})

app.listen(PORT, () => {
    console.log(`Server: I'm still alive...at ${PORT}`)
})