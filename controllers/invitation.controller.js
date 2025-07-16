import { ObjectId } from 'mongodb';

export const getMyInvitations = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id);
        
        const pipeline = [
            { $match: { _id: userId } },
            
            { $unwind: '$invitations' },
            
            {
                $lookup: {
                    from: 'teams',
                    localField: 'invitations.teamId',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: '$teamDetails' },

            {
                $lookup: {
                    from: 'users',
                    localField: 'teamDetails.captain',
                    foreignField: '_id',
                    as: 'captainDetails'
                }
            },
            { $unwind: '$captainDetails' },

            {
                $lookup: {
                    from: 'users',
                    localField: 'teamDetails.players',
                    foreignField: '_id',
                    as: 'playerDetails'
                }
            },

            {
                $project: {
                    _id: '$invitations._id',
                    teamName: '$invitations.teamName',
                    invitedAt: '$invitations.invitedAt',
                    teamId: '$invitations.teamId',
                    captain: {
                        _id: '$captainDetails._id',
                        username: '$captainDetails.username',
                        fullName: '$captainDetails.full_name'
                    },
                    players: {
                        $map: {
                           input: "$playerDetails",
                           as: "player",
                           in: { username: "$$player.username", fullName: "$$player.full_name" }
                        }
                    }
                }
            }
        ];

        const invitations = await db.collection('users').aggregate(pipeline).toArray();
        
        res.status(200).json(invitations);

    } catch (error) {
        console.error("Error fetching invitations:", error);
        res.status(500).json({ message: 'Server error while fetching invitations.' });
    }
};

export const respondToInvitation = async (req, res, db) => {
    try {
        const { id: invitationId } = req.params;
        const { response } = req.body;
        const userId = new ObjectId(req.user.id);

        if (!['accepted', 'rejected'].includes(response)) {
            return res.status(400).json({ message: 'Invalid response. Must be "accepted" or "rejected".' });
        }
        
        const user = await db.collection('users').findOne({ _id: userId, "invitations._id": new ObjectId(invitationId) });
        if (!user) {
            return res.status(404).json({ message: 'Invitation not found for this user.' });
        }
        
        const invitation = user.invitations.find(inv => inv._id.toString() === invitationId);
        if (!invitation) {
            return res.status(404).json({ message: 'Invitation details not found.' });
        }

        await db.collection('users').updateOne(
            { _id: userId },
            { $pull: { invitations: { _id: new ObjectId(invitationId) } } }
        );

        if (response === 'accepted') {
            await db.collection('teams').updateOne(
                { _id: invitation.teamId },
                { $addToSet: { players: userId } }
            );
            return res.status(200).json({ message: `Successfully joined team ${invitation.teamName}.` });
        } else {
            return res.status(200).json({ message: `Invitation for team ${invitation.teamName} rejected.` });
        }

    } catch (error) {
        console.error("Error responding to invitation:", error);
        res.status(500).json({ message: 'Server error while responding to invitation.' });
    }
};