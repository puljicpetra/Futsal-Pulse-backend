import express from 'express';
import { authMiddleware } from '../auth.js';
import * as matchController from '../controllers/match.controller.js';
import { createMatchValidationRules } from '../controllers/match.controller.js';

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

    router.put(
        '/:matchId',
        authMiddleware,
        (req, res) => matchController.updateMatch(req, res, db)
    );

    router.delete(
        '/:matchId',
        authMiddleware,
        (req, res) => matchController.deleteMatch(req, res, db)
    );

    return router;
};