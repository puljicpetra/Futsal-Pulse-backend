import { ObjectId } from 'mongodb';

export const respondToInvitation = async (req, res, db) => {
    try {
        const { id: notificationId } = req.params;
        const { response } = req.body;
        const userId = new ObjectId(req.user.id);

        if (!['accepted', 'rejected'].includes(response)) {
            return res.status(400).json({ message: 'Invalid response. Must be "accepted" or "rejected".' });
        }
        
        const notification = await db.collection('notifications').findOne({
            _id: new ObjectId(notificationId),
            userId: userId,
            type: 'team_invitation'
        });

        if (!notification) {
            return res.status(404).json({ message: 'Invitation notification not found or you do not have permission to respond.' });
        }

        const teamId = notification.data.teamId;
        const teamName = notification.data.teamName;

        await db.collection('notifications').deleteOne({ _id: notification._id });

        if (response === 'accepted') {
            await db.collection('teams').updateOne(
                { _id: new ObjectId(teamId) },
                { $addToSet: { players: userId } }
            );
            return res.status(200).json({ message: `Successfully joined team ${teamName}.` });
        } else {
            return res.status(200).json({ message: `Invitation for team ${teamName} rejected.` });
        }

    } catch (error) {
        console.error("Error responding to invitation:", error);
        res.status(500).json({ message: 'Server error while responding to invitation.' });
    }
};