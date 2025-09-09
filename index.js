import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

import uploadMemory from './middleware/upload.js'
import { connectToDatabase, ensureIndexes } from './db.js'

import { createAuthRouter } from './routes/auth.routes.js'
import { createUserRouter } from './routes/user.routes.js'
import { createTournamentRouter } from './routes/tournament.routes.js'
import { createTeamRouter } from './routes/team.routes.js'
import { createRegistrationRouter } from './routes/registration.routes.js'
import { createInvitationRouter } from './routes/invitation.routes.js'
import { createNotificationRouter } from './routes/notification.routes.js'
import { createMatchRouter } from './routes/match.routes.js'
import { createReviewRouter } from './routes/review.routes.js'
import playersRouter from './routes/players.routes.js'
import { createTournamentAnnouncementsRouter } from './routes/tournament.announcements.routes.js'

const app = express()
let db

const uploadDir = path.resolve('uploads')
fs.mkdirSync(uploadDir, { recursive: true })

async function startServer() {
    try {
        db = await connectToDatabase()
        await ensureIndexes(db)

        app.use(cors())
        app.use(express.json())

        app.use(
            '/uploads',
            express.static(uploadDir, {
                dotfiles: 'ignore',
                maxAge: '7d',
                setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
            })
        )

        app.use((req, _res, next) => {
            req.db = db
            next()
        })
        app.get('/', (_req, res) => res.send('Futsal Pulse Backend is running!'))

        const authRouter = createAuthRouter(db)
        const userRouter = createUserRouter(db, uploadMemory)
        const tournamentAnnouncementsRouter = createTournamentAnnouncementsRouter(db)
        const tournamentRouter = createTournamentRouter(db, uploadMemory)
        const teamRouter = createTeamRouter(db)
        const registrationRouter = createRegistrationRouter(db)
        const invitationRouter = createInvitationRouter(db)
        const notificationRouter = createNotificationRouter(db)
        const matchRouter = createMatchRouter(db)
        const reviewRouter = createReviewRouter(db)

        app.use('/auth', authRouter)
        app.use('/api/users', userRouter)
        app.use('/api/tournaments', tournamentAnnouncementsRouter)
        app.use('/api/tournaments', tournamentRouter)
        app.use('/api/teams', teamRouter)
        app.use('/api/registrations', registrationRouter)
        app.use('/api/invitations', invitationRouter)
        app.use('/api/notifications', notificationRouter)
        app.use('/api/matches', matchRouter)
        app.use('/api', reviewRouter)
        app.use('/api/players', playersRouter)

        app.use((err, _req, res, next) => {
            if (err instanceof multer.MulterError || err?.code === 'LIMIT_FILE_SIZE') {
                const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large.' : err.message
                return res.status(400).json({ message })
            }
            if (err?.code === 'INVALID_FILE_TYPE') {
                return res.status(400).json({ message: 'Invalid file type. Only JPG/PNG allowed.' })
            }
            return next(err)
        })

        const PORT = process.env.PORT || 3001
        app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`))
    } catch (error) {
        console.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer()
