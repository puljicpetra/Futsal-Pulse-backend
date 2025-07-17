import express from 'express';
import { authMiddleware } from '../auth.js';
import * as notificationController from '../controllers/notification.controller.js';

export const createNotificationRouter = (db) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.get(
        '/',
        (req, res) => notificationController.getMyNotifications(req, res, db)
    );

    router.get(
        '/count',
        (req, res) => notificationController.getUnreadNotificationCount(req, res, db)
    );

    router.post(
        '/mark-read',
        (req, res) => notificationController.markNotificationsAsRead(req, res, db)
    );
    
    router.delete(
        '/',
        (req, res) => notificationController.deleteAllMyNotifications(req, res, db)
    );
    
    router.delete(
        '/:id',
        (req, res) => notificationController.deleteNotificationById(req, res, db)
    );

    return router;
};