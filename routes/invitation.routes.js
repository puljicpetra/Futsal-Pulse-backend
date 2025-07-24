import express from 'express';
import { body } from 'express-validator';
import { authMiddleware } from '../auth.js';
import * as invitationController from '../controllers/invitation.controller.js';

const responseValidationRules = [
    body('response')
        .trim()
        .notEmpty().withMessage('Response is required.')
        .isIn(['accepted', 'rejected']).withMessage('Invalid response value.')
];

export const createInvitationRouter = (db) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.post(
        '/:id/respond',
        responseValidationRules,
        (req, res) => invitationController.respondToInvitation(req, res, db)
    );
    
    return router;
};