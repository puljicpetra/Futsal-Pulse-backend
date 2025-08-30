import express from 'express'
import { body } from 'express-validator'
import { authMiddleware } from '../auth.js'
import * as teamController from '../controllers/team.controller.js'

const createTeamValidationRules = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Team name is required.')
        .isLength({ min: 3, max: 50 })
        .withMessage('Team name must be between 3 and 50 characters.'),
]

const invitePlayerValidationRules = [
    body('playerId')
        .trim()
        .notEmpty()
        .withMessage('Player ID is required.')
        .isMongoId()
        .withMessage('Invalid Player ID format.'),
]

export const createTeamRouter = (db) => {
    const router = express.Router()

    router.get('/', (req, res) => teamController.getAllTeams(req, res, db))

    router.get('/me', authMiddleware, (req, res) => teamController.getMyTeams(req, res, db))

    router.get('/:id', (req, res) => teamController.getTeamById(req, res, db))

    router.use(authMiddleware)

    router.post('/', createTeamValidationRules, (req, res) =>
        teamController.createTeam(req, res, db)
    )

    router.delete('/:id', (req, res) => teamController.deleteTeam(req, res, db))

    router.post('/:id/invites', invitePlayerValidationRules, (req, res) =>
        teamController.invitePlayer(req, res, db)
    )

    router.delete('/:teamId/players/:playerId', (req, res) =>
        teamController.removePlayerFromTeam(req, res, db)
    )

    return router
}
