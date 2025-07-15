import { ObjectId } from 'mongodb';
import { validationResult } from 'express-validator';

export const getMyProfile = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id);
        
        const userProfile = await db.collection('users').findOne(
            { _id: userId },
            { projection: { password: 0 } }
        );

        if (!userProfile) {
            return res.status(404).json({ message: 'User profile not found.' });
        }

        res.status(200).json(userProfile);

    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ message: 'Server error while fetching profile.' });
    }
};

export const updateMyProfile = async (req, res, db) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'fail', errors: errors.array() });
    }

    try {
        const userId = new ObjectId(req.user.id);
        const updates = {};
        const allowedUpdates = ['full_name', 'bio', 'contact_phone'];

        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No update fields provided.' });
        }

        updates.updatedAt = new Date();

        await db.collection('users').updateOne(
            { _id: userId },
            { $set: updates }
        );

        const updatedUserProfile = await db.collection('users').findOne(
            { _id: userId },
            { projection: { password: 0 } }
        );

        res.status(200).json(updatedUserProfile);

    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: 'Server error while updating profile.' });
    }
};

export const uploadAvatar = async (req, res, db) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        const userId = new ObjectId(req.user.id);
        const avatarUrl = `/uploads/${req.file.filename}`;

        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { profile_image_url: avatarUrl, updatedAt: new Date() } }
        );

        res.status(200).json({ profile_image_url: avatarUrl });

    } catch (error) {
        console.error("Error uploading avatar:", error);
        res.status(500).json({ message: 'Server error while uploading image.' });
    }
};