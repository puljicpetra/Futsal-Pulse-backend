import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
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

const app = express()
let db

const uploadDir = path.resolve('uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, `${file.fieldname}-${Date.now()}${ext}`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
        const err = new Error('INVALID_FILE_TYPE')
        err.code = 'INVALID_FILE_TYPE'
        return cb(err)
    },
})

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
                setHeaders: (res) => {
                    res.setHeader('X-Content-Type-Options', 'nosniff')
                },
            })
        )

        app.use((req, _res, next) => {
            req.db = db
            next()
        })

        app.get('/', (_req, res) => res.send('Futsal Pulse Backend is running!'))

        const authRouter = createAuthRouter(db)
        const userRouter = createUserRouter(db, upload)
        const tournamentRouter = createTournamentRouter(db, upload)
        const teamRouter = createTeamRouter(db)
        const registrationRouter = createRegistrationRouter(db)
        const invitationRouter = createInvitationRouter(db)
        const notificationRouter = createNotificationRouter(db)
        const matchRouter = createMatchRouter(db)
        const reviewRouter = createReviewRouter(db)

        app.use('/auth', authRouter)
        app.use('/api/users', userRouter)
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
                const message =
                    err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Max 5MB.' : err.message
                return res.status(400).json({ message })
            }
            if (err?.code === 'INVALID_FILE_TYPE') {
                return res
                    .status(400)
                    .json({ message: 'Invalid file type. Only JPG, PNG, WEBP allowed.' })
            }
            return next(err)
        })

        const PORT = process.env.PORT || 3001
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`)
        })
    } catch (error) {
        console.error('Failed to start server:', error)
        process.exit(1)
    }
}

startServer()
