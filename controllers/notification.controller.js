import { ObjectId } from 'mongodb'
import { validationResult } from 'express-validator'

export const getMyNotifications = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id)

        const pipeline = [
            { $match: { userId: userId } },
            { $sort: { createdAt: -1 } },
            { $limit: 20 },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'data.teamId',
                    foreignField: '_id',
                    as: 'teamDetails',
                },
            },
            {
                $addFields: {
                    team: { $arrayElemAt: ['$teamDetails', 0] },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'team.players',
                    foreignField: '_id',
                    pipeline: [
                        { $project: { _id: 1, username: 1, full_name: 1, profile_image_url: 1 } },
                    ],
                    as: 'playerDetails',
                },
            },
        ]

        const notifications = await db.collection('notifications').aggregate(pipeline).toArray()

        const processedNotifications = notifications.map((notif) => {
            if (notif.type === 'team_invitation' && notif.team) {
                if (!notif.data) {
                    notif.data = {}
                }

                notif.data.team = notif.team

                const captain = notif.playerDetails.find((p) => p._id.equals(notif.team.captain))
                if (captain) {
                    notif.data.captain = captain
                }

                notif.data.team.players = notif.playerDetails
            }

            delete notif.teamDetails
            delete notif.playerDetails
            delete notif.team
            return notif
        })

        res.status(200).json(processedNotifications)
    } catch (error) {
        console.error('Error fetching notifications:', error)
        res.status(500).json({ message: 'Server error while fetching notifications.' })
    }
}

export const getUnreadNotificationCount = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id)

        const count = await db.collection('notifications').countDocuments({
            userId: userId,
            isRead: false,
            type: 'team_invitation',
        })

        res.status(200).json({ count })
    } catch (error) {
        console.error('Error fetching unread notification count:', error)
        res.status(500).json({ message: 'Server error while fetching notification count.' })
    }
}

export const markNotificationsAsRead = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        const userId = new ObjectId(req.user.id)
        const { notificationIds } = req.body

        const objectIds = notificationIds.map((id) => new ObjectId(id))

        await db
            .collection('notifications')
            .updateMany({ _id: { $in: objectIds }, userId: userId }, { $set: { isRead: true } })

        res.status(200).json({ message: 'Selected notifications marked as read.' })
    } catch (error) {
        console.error('Error marking notifications as read:', error)
        res.status(500).json({ message: 'Server error while updating notifications.' })
    }
}

export const deleteAllMyNotifications = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id)

        await db.collection('notifications').deleteMany({ userId: userId })

        res.status(200).json({ message: 'All notifications cleared.' })
    } catch (error) {
        console.error('Error deleting all notifications:', error)
        res.status(500).json({ message: 'Server error while clearing notifications.' })
    }
}

export const deleteNotificationById = async (req, res, db) => {
    try {
        const { id: notificationId } = req.params
        const userId = new ObjectId(req.user.id)

        if (!ObjectId.isValid(notificationId)) {
            return res.status(400).json({ message: 'Invalid notification ID format.' })
        }

        const result = await db.collection('notifications').deleteOne({
            _id: new ObjectId(notificationId),
            userId: userId,
        })

        if (result.deletedCount === 0) {
            return res
                .status(404)
                .json({
                    message: 'Notification not found or you do not have permission to delete it.',
                })
        }

        res.status(200).json({ message: 'Notification deleted.' })
    } catch (error) {
        console.error('Error deleting notification:', error)
        res.status(500).json({ message: 'Server error while deleting notification.' })
    }
}
