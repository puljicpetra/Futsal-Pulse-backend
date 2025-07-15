import express from 'express';
import { body } from 'express-validator';
import { authMiddleware } from '../auth.js';
import * as userController from '../controllers/user.controller.js';

const updateProfileValidationRules = [
    body('full_name')
        .optional()
        .trim()
        .isLength({ min: 2 })
        .withMessage('Full name must be at least 2 characters.'),

    body('bio')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Bio cannot exceed 500 characters.'),

    body('contact_phone')
        .optional()
        .trim()
        .matches(/^\+?[0-9\s\-()]{7,20}$/)
        .withMessage('Invalid phone number format.')
];

export const createUserRouter = (db, upload) => {
    const router = express.Router();

    router.use(authMiddleware);

    router.get(
        '/me', 
        (req, res) => userController.getMyProfile(req, res, db)
    );

    router.put(
        '/me', 
        updateProfileValidationRules, 
        (req, res) => userController.updateMyProfile(req, res, db)
    );

    router.post(
        '/me/avatar', 
        upload.single('avatar'), 
        (req, res) => userController.uploadAvatar(req, res, db)
    );
    
    return router;
};