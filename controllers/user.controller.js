import { ObjectId } from 'mongodb'
import { validationResult } from 'express-validator'
import fs from 'fs/promises'
import path from 'path'
import { uploadBufferToCloudinary, deleteFromCloudinary } from '../utils/uploadToCloudinary.js'

const UPLOADS_DIR = path.resolve('uploads')

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function deleteOldLocalUpload(url) {
    if (!url || typeof url !== 'string') return
    if (!url.startsWith('/uploads/')) return
    const filename = path.basename(url)
    const absPath = path.join(UPLOADS_DIR, filename)
    try {
        await fs.unlink(absPath)
    } catch (_) {}
}

function extractCloudinaryPublicIdFromUrl(url) {
    try {
        const u = new URL(url)
        const i = u.pathname.indexOf('/upload/')
        if (i === -1) return null
        let rest = u.pathname.slice(i + '/upload/'.length)
        const parts = rest.split('/').filter(Boolean)
        if (parts.length === 0) return null
        if (/^v\d+$/.test(parts[0])) parts.shift()
        const withFolders = parts.join('/')
        return withFolders.replace(/\.[^.\/]+$/, '')
    } catch {
        return null
    }
}

async function deleteOldCloudinaryByUrlOrId(val) {
    try {
        if (!val) return
        let publicId = val
        if (typeof val === 'string' && /^https?:\/\//i.test(val)) {
            publicId = extractCloudinaryPublicIdFromUrl(val)
        }
        if (!publicId) return
        await deleteFromCloudinary(publicId)
    } catch (_) {}
}

export const searchUsers = async (req, res, db) => {
    try {
        const { query } = req.query

        if (!query || query.trim().length < 2) {
            return res
                .status(400)
                .json({ message: 'Search query must be at least 2 characters long.' })
        }

        const q = escapeRegex(query.trim())
        const searchRegex = new RegExp(q, 'i')

        const users = await db
            .collection('users')
            .find({
                $or: [
                    { username: { $regex: searchRegex } },
                    { full_name: { $regex: searchRegex } },
                ],
                role: 'player',
            })
            .project({
                _id: 1,
                username: 1,
                full_name: 1,
                profile_image_url: 1,
            })
            .limit(10)
            .toArray()

        return res.status(200).json(users)
    } catch (error) {
        console.error('Error searching users:', error)
        return res.status(500).json({ message: 'Server error during user search.' })
    }
}

export const getMyProfile = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id)

        const userProfile = await db
            .collection('users')
            .findOne({ _id: userId }, { projection: { password: 0 } })

        if (!userProfile) {
            return res.status(404).json({ message: 'User profile not found.' })
        }

        return res.status(200).json(userProfile)
    } catch (error) {
        console.error('Error fetching profile:', error)
        return res.status(500).json({ message: 'Server error while fetching profile.' })
    }
}

export const updateMyProfile = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'fail', errors: errors.array() })
    }

    try {
        const userId = new ObjectId(req.user.id)
        const updates = {}
        const allowedUpdates = ['full_name', 'bio', 'contact_phone']

        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key]
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No update fields provided.' })
        }

        updates.updatedAt = new Date()

        await db.collection('users').updateOne({ _id: userId }, { $set: updates })

        const updatedUserProfile = await db
            .collection('users')
            .findOne({ _id: userId }, { projection: { password: 0 } })

        return res.status(200).json(updatedUserProfile)
    } catch (error) {
        console.error('Error updating profile:', error)
        return res.status(500).json({ message: 'Server error while updating profile.' })
    }
}

export const uploadAvatar = async (req, res, db) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' })
        }

        const userId = new ObjectId(req.user.id)

        const userDoc = await db
            .collection('users')
            .findOne(
                { _id: userId },
                { projection: { _id: 1, profile_image_url: 1, profile_image_public_id: 1 } }
            )

        if (!userDoc) {
            return res.status(404).json({ message: 'User not found.' })
        }

        const uploadRes = await uploadBufferToCloudinary(req.file.buffer, {
            folder: 'futsal-pulse/avatars',
            public_id: `user_${userId}`,
            resource_type: 'image',
            overwrite: true,
            invalidate: true,
        })

        const newUrl = uploadRes.secure_url || uploadRes.url
        const newPublicId = uploadRes.public_id

        await db.collection('users').updateOne(
            { _id: userId },
            {
                $set: {
                    profile_image_url: newUrl,
                    profile_image_public_id: newPublicId,
                    updatedAt: new Date(),
                },
            }
        )

        if (userDoc.profile_image_public_id && userDoc.profile_image_public_id !== newPublicId) {
            await deleteOldCloudinaryByUrlOrId(userDoc.profile_image_public_id)
        } else if (userDoc.profile_image_url && userDoc.profile_image_url !== newUrl) {
            if (userDoc.profile_image_url.startsWith('/uploads/')) {
                await deleteOldLocalUpload(userDoc.profile_image_url)
            } else {
                await deleteOldCloudinaryByUrlOrId(userDoc.profile_image_url)
            }
        }

        return res.status(200).json({ profile_image_url: newUrl })
    } catch (error) {
        console.error('Error uploading avatar:', error)
        return res.status(500).json({ message: 'Server error while uploading image.' })
    }
}
