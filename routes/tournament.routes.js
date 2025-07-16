import express from 'express';
import { authMiddleware } from '../auth.js';
import * as tournamentController from '../controllers/tournament.controller.js';

export const createTournamentRouter = (db, upload) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.post(
        '/',
        upload.single('tournamentImage'),
        (req, res) => tournamentController.createTournament(req, res, db)
    );

    router.get(
        '/', 
        (req, res) => tournamentController.getAllTournaments(req, res, db)
    );

    router.get(
        '/:id', 
        (req, res) => tournamentController.getTournamentById(req, res, db)
    );

    router.put(
        '/:id',
        upload.single('tournamentImage'),
        (req, res) => tournamentController.updateTournament(req, res, db)
    );

    router.delete(
        '/:id',
        (req, res) => tournamentController.deleteTournament(req, res, db)
    );
    
    return router;
};