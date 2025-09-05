import express from 'express'
import { authMiddleware } from '../auth.js'
import {
    getTournamentReviews,
    upsertTournamentReview,
    deleteReview,
    createReviewValidationRules,
} from '../controllers/review.controller.js'

export const createReviewRouter = (db) => {
    const router = express.Router()

    router.get('/tournaments/:id/reviews', (req, res) => getTournamentReviews(req, res, db))

    router.post(
        '/tournaments/:id/reviews',
        authMiddleware,
        createReviewValidationRules(),
        (req, res) => upsertTournamentReview(req, res, db)
    )

    router.delete('/reviews/:id', authMiddleware, (req, res) => deleteReview(req, res, db))

    return router
}
