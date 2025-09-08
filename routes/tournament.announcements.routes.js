import express from 'express'
import { body } from 'express-validator'
import { authMiddleware } from '../auth.js'
import * as ctrl from '../controllers/tournament.announcements.controller.js'

export const createTournamentAnnouncementsRouter = (db) => {
    const router = express.Router()

    router.use(authMiddleware)

    router.post('/:id/subscribe', (req, res) => ctrl.subscribe(req, res, db))
    router.delete('/:id/subscribe', (req, res) => ctrl.unsubscribe(req, res, db))
    router.get('/:id/subscription', (req, res) => ctrl.getSubscription(req, res, db))

    router.get('/:id/announcements', (req, res) => ctrl.listAnnouncements(req, res, db))

    const validateCreate = [
        body('text')
            .trim()
            .isLength({ min: 1, max: 4000 })
            .withMessage('Text is required (1–4000).'),
        body('title').optional().trim().isLength({ max: 160 }).withMessage('Title too long.'),
    ]
    router.post('/:id/announcements', validateCreate, (req, res) =>
        ctrl.createAnnouncement(req, res, db)
    )

    return router
}
