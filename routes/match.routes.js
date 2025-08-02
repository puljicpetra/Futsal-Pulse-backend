import express from 'express';
import { authMiddleware } from '../auth.js';
import * as matchController from '../controllers/match.controller.js';
import { 
    createMatchValidationRules, 
    addEventValidationRules,
    addPenaltyEventValidationRules
} from '../controllers/match.controller.js';


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

    router.get(
        '/:id',
        (req, res) => matchController.getMatchById(req, res, db)
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

    router.delete(
        '/:matchId',
        authMiddleware,
        (req, res) => matchController.deleteMatch(req, res, db)
    );

    router.post(
        '/:matchId/events',
        authMiddleware,
        addEventValidationRules(),
        (req, res) => matchController.addMatchEvent(req, res, db)
    );

    router.delete(
        '/:matchId/events/:eventId',
        authMiddleware,
        (req, res) => matchController.deleteMatchEvent(req, res, db)
    );

    router.post(
        '/:matchId/penalties',
        authMiddleware,
        addPenaltyEventValidationRules(),
        (req, res) => matchController.addPenaltyEvent(req, res, db)
    );

    return router;
};