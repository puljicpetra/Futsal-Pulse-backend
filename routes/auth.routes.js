import express from 'express'
import { body } from 'express-validator'
import * as authController from '../controllers/auth.controller.js'

const registerValidationRules = [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('email').isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long.'),
    body('role')
        .trim()
        .notEmpty()
        .isIn(['organizer', 'player', 'fan'])
        .withMessage('Invalid role specified.'),
]

const loginValidationRules = [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
]

export const createAuthRouter = (db) => {
    const router = express.Router()

    router.post('/register', registerValidationRules, (req, res) =>
        authController.register(req, res, db)
    )

    router.post('/login', loginValidationRules, (req, res) => authController.login(req, res, db))

    return router
}
