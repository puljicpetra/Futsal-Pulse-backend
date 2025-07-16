import express from 'express';
import { authMiddleware } from '../auth.js';
import * as teamController from '../controllers/team.controller.js';

export const createTeamRouter = (db) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.post(
        '/',
        (req, res) => teamController.createTeam(req, res, db)
    );

    router.get(
        '/',
        (req, res) => teamController.getMyTeams(req, res, db)
    );

    router.get(
        '/:id',
        (req, res) => teamController.getTeamById(req, res, db)
    );

    router.post(
        '/:id/invites',
        (req, res) => teamController.invitePlayer(req, res, db)
    );
    
    router.delete(
        '/:teamId/players/:playerId',
        (req, res) => teamController.removePlayerFromTeam(req, res, db)
    );

    return router;
};