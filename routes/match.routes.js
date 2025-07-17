import express from 'express';
import { authMiddleware } from '../auth.js';
import * as matchController from '../controllers/match.controller.js';

export const createMatchRouter = (db) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.post(
        '/',
        (req, res) => matchController.createMatch(req, res, db)
    );

    router.get(
        '/tournament/:tournamentId',
        (req, res) => matchController.getMatchesForTournament(req, res, db)
    );

    router.put(
        '/:matchId',
        (req, res) => matchController.updateMatch(req, res, db)
    );

    router.delete(
        '/:matchId',
        (req, res) => matchController.deleteMatch(req, res, db)
    );

    return router;
};