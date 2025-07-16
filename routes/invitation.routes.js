import express from 'express';
import { authMiddleware } from '../auth.js';
import * as invitationController from '../controllers/invitation.controller.js';

export const createInvitationRouter = (db) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.get(
        '/',
        (req, res) => invitationController.getMyInvitations(req, res, db)
    );

    router.post(
        '/:id/respond',
        (req, res) => invitationController.respondToInvitation(req, res, db)
    );
    
    return router;
};