import express from 'express';
import { body } from 'express-validator';
import { authMiddleware } from '../auth.js';
import * as matchController from '../controllers/match.controller.js';
import { createMatchValidationRules } from '../controllers/match.controller.js';

const updateScoreValidationRules = [
    body('scoreA')
        .notEmpty().withMessage('Score for Team A is required.')
        .isInt({ min: 0, max: 99 }).withMessage('Score must be a number between 0 and 99.'),
    body('scoreB')
        .notEmpty().withMessage('Score for Team B is required.')
        .isInt({ min: 0, max: 99 }).withMessage('Score must be a number between 0 and 99.')
];

export const createMatchRouter = (db) => {
    const router = express.Router();

    router.get(
        '/',
        (req, res) => matchController.getAllMatches(req, res, db)
    );

    router.get(
        '/tournament/:tournamentId',
        (req, res) => matchController.getMatchesForTournament(req, res, db)
    );

    router.post(
        '/',
        authMiddleware,
        createMatchValidationRules(),
        (req, res) => matchController.createMatch(req, res, db)
    );

    router.patch(
        '/:matchId/finish',
        authMiddleware,
        (req, res) => matchController.finishMatch(req, res, db)
    );

    router.put(
        '/:matchId',
        authMiddleware,
        updateScoreValidationRules,
        (req, res) => matchController.updateMatch(req, res, db)
    );

    router.delete(
        '/:matchId',
        authMiddleware,
        (req, res) => matchController.deleteMatch(req, res, db)
    );

    return router;
};