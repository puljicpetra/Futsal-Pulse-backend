import express from 'express';
import { body } from 'express-validator';
import { authMiddleware } from '../auth.js';
import * as tournamentController from '../controllers/tournament.controller.js';

const tournamentValidationRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('Tournament name is required.')
        .isLength({ min: 3, max: 100 }).withMessage('Tournament name must be between 3 and 100 characters.'),
    
    body('location')
        .notEmpty().withMessage('Location data is required.')
        .isJSON().withMessage('Location must be a valid JSON object string.')
        .custom(value => {
            const parsedLocation = JSON.parse(value);
            if (!parsedLocation.city || typeof parsedLocation.city !== 'string' || parsedLocation.city.trim() === '') {
                throw new Error('City is required within the location data.');
            }
            return true;
        }),

    body('startDate')
        .notEmpty().withMessage('Start date is required.')
        .isISO8601().toDate().withMessage('Invalid date format for start date.'),

    body('endDate')
        .optional()
        .isISO8601().toDate().withMessage('Invalid date format for end date.')
        .custom((value, { req }) => {
            if (value && new Date(value) < new Date(req.body.startDate)) {
                throw new Error('End date cannot be before the start date.');
            }
            return true;
        }),

    body('surface')
        .trim()
        .notEmpty().withMessage('Playing surface is required.'),

    body('rules')
        .optional()
        .trim()
        .isLength({ max: 5000 }).withMessage('Rules/description cannot exceed 5000 characters.')
];


export const createTournamentRouter = (db, upload) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.post(
        '/',
        upload.single('tournamentImage'),
        tournamentValidationRules,
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
        tournamentValidationRules,
        (req, res) => tournamentController.updateTournament(req, res, db)
    );

    router.delete(
        '/:id',
        (req, res) => tournamentController.deleteTournament(req, res, db)
    );
    
    return router;
};