import express from 'express';
import { body } from 'express-validator';
import { authMiddleware } from '../auth.js';
import * as notificationController from '../controllers/notification.controller.js';

const markAsReadValidationRules = [
    body('notificationIds')
        .notEmpty().withMessage('notificationIds array cannot be empty.')
        .isArray().withMessage('notificationIds must be an array.'),
    body('notificationIds.*')
        .isMongoId().withMessage('Each ID in notificationIds must be a valid Mongo ID.')
];

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
        markAsReadValidationRules,
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