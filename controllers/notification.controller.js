import { ObjectId } from 'mongodb';

export const getMyNotifications = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id);
        
        const pipeline = [
            { $match: { userId: userId } },
            { $sort: { createdAt: -1 } },
            { $limit: 20 },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'data.teamId',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            {
                $addFields: {
                    team: { $arrayElemAt: ["$teamDetails", 0] }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'team.players',
                    foreignField: '_id',
                    pipeline: [
                         { $project: { _id: 1, username: 1, full_name: 1, profile_image_url: 1 } }
                    ],
                    as: 'playerDetails'
                }
            },
        ];
        
        const notifications = await db.collection('notifications').aggregate(pipeline).toArray();

        const processedNotifications = notifications.map(notif => {
            if (notif.type === 'team_invitation' && notif.team) {
                if (!notif.data) {
                    notif.data = {};
                }
                
                notif.data.team = notif.team;
                
                const captain = notif.playerDetails.find(p => p._id.equals(notif.team.captain));
                if (captain) {
                    notif.data.captain = captain;
                }

                notif.data.team.players = notif.playerDetails;
            }

            delete notif.teamDetails;
            delete notif.playerDetails;
            delete notif.team;
            return notif;
        });

        res.status(200).json(processedNotifications);

    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: 'Server error while fetching notifications.' });
    }
};

export const getUnreadNotificationCount = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id);

        const count = await db.collection('notifications').countDocuments({ 
            userId: userId, 
            isRead: false,
            type: 'team_invitation'
        });

        res.status(200).json({ count });
    } catch (error) {
        console.error("Error fetching unread notification count:", error);
        res.status(500).json({ message: 'Server error while fetching notification count.' });
    }
};

export const markNotificationsAsRead = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { notificationIds } = req.body;

        if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(200).json({ message: 'No notification IDs provided to mark as read.' });
        }

        const objectIds = notificationIds.map(id => new ObjectId(id));

        await db.collection('notifications').updateMany(
            { _id: { $in: objectIds }, userId: userId },
            { $set: { isRead: true } }
        );

        res.status(200).json({ message: 'Selected notifications marked as read.' });
    } catch (error) {
        console.error("Error marking notifications as read:", error);
        res.status(500).json({ message: 'Server error while updating notifications.' });
    }
};