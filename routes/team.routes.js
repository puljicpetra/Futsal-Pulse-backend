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
        (req, res) => teamController.getTeamsForTournament(req, res, db)
    );
    
    return router;
};