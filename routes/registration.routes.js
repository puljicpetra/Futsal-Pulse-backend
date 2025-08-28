import express from 'express'
import { authMiddleware } from '../auth.js'
import * as registrationController from '../controllers/registration.controller.js'

export const createRegistrationRouter = (db) => {
    const router = express.Router()

    router.use(authMiddleware)

    router.post('/', (req, res) => registrationController.createRegistration(req, res, db))

    router.get('/', (req, res) =>
        registrationController.getRegistrationsForTournament(req, res, db)
    )

    router.patch('/:id', (req, res) =>
        registrationController.updateRegistrationStatus(req, res, db)
    )

    router.post('/:registrationId/request-withdrawal', (req, res) =>
        registrationController.requestWithdrawal(req, res, db)
    )

    return router
}
