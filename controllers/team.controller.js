import { ObjectId } from 'mongodb';

export const createTeam = async (req, res, db) => {
    if (req.user.role !== 'player') {
        return res.status(403).json({ message: 'Forbidden: Only players can create teams.' });
    }

    try {
        const { name } = req.body;
        const captainId = new ObjectId(req.user.id);

        if (!name) {
            return res.status(400).json({ message: 'Team name is required.' });
        }

        const existingTeam = await db.collection('teams').findOne({ name, captain: captainId });
        if (existingTeam) {
            return res.status(409).json({ message: 'You already have a team with that name.' });
        }

        const newTeam = {
            name,
            captain: captainId,
            players: [captainId],
            createdAt: new Date(),
        };

        const result = await db.collection('teams').insertOne(newTeam);

        res.status(201).json({ 
            message: 'Team created successfully!', 
            team: { _id: result.insertedId, ...newTeam }
        });

    } catch (error) {
        console.error("Error creating team:", error);
        res.status(500).json({ message: 'Server error while creating team.' });
    }
};

export const getMyTeams = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id);
        
        const teams = await db.collection('teams').find({ players: userId }).toArray();
        
        res.status(200).json(teams);
    } catch (error) {
        console.error("Error fetching user's teams:", error);
        res.status(500).json({ message: 'Server error while fetching teams.' });
    }
};

export const getTeamById = async (req, res, db) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid team ID format.' });
        }

        const pipeline = [
            { $match: { _id: new ObjectId(id) } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'players',
                    foreignField: '_id',
                    as: 'playerDetails'
                }
            },
            {
                $project: {
                    name: 1,
                    captain: 1,
                    createdAt: 1,
                    players: {
                        $map: {
                           input: "$playerDetails",
                           as: "player",
                           in: { 
                               _id: "$$player._id",
                               username: "$$player.username", 
                               full_name: "$$player.full_name",
                               profile_image_url: "$$player.profile_image_url"
                            }
                        }
                    }
                }
            }
        ];

        const result = await db.collection('teams').aggregate(pipeline).toArray();
        
        if (result.length === 0) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        
        res.status(200).json(result[0]);

    } catch (error) {
        console.error("Error fetching team by ID:", error);
        res.status(500).json({ message: 'Server error while fetching team.' });
    }
};

export const invitePlayer = async (req, res, db) => {
    try {
        const { id: teamId } = req.params;
        const { playerIdToInvite } = req.body;
        const requesterId = new ObjectId(req.user.id);

        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
        if (!team) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        if (team.captain.toString() !== requesterId.toString()) {
            return res.status(403).json({ message: 'Forbidden: Only the team captain can invite players.' });
        }

        const playerToInvite = await db.collection('users').findOne({ _id: new ObjectId(playerIdToInvite) });
        if (!playerToInvite) {
            return res.status(404).json({ message: 'Player to invite not found.' });
        }
        if (playerToInvite._id.toString() === requesterId.toString()) {
            return res.status(400).json({ message: 'You cannot invite yourself.' });
        }
        
        const playerAlreadyInTeam = team.players.some(p => p.equals(new ObjectId(playerIdToInvite)));
        if (playerAlreadyInTeam) {
            return res.status(409).json({ message: 'This player is already in the team.' });
        }
        
        const existingNotification = await db.collection('notifications').findOne({
            userId: playerToInvite._id,
            'data.teamId': team._id,
            type: 'team_invitation',
            isRead: false
        });
        if (existingNotification) {
            return res.status(409).json({ message: 'This player has already been invited and has not responded yet.' });
        }

        const notification = {
            userId: playerToInvite._id,
            message: `You have a new invitation to join the team "${team.name}".`,
            type: 'team_invitation',
            isRead: false,
            createdAt: new Date(),
            data: {
                teamId: team._id,
                teamName: team.name,
                inviterId: requesterId
            }
        };
        await db.collection('notifications').insertOne(notification);

        res.status(200).json({ message: `Invitation sent to ${playerToInvite.username}.` });

    } catch (error) {
        console.error("Error inviting player:", error);
        res.status(500).json({ message: 'Server error while sending invitation.' });
    }
};

export const removePlayerFromTeam = async (req, res, db) => {
    try {
        const { teamId, playerId } = req.params;
        const requesterId = new ObjectId(req.user.id);

        if (!ObjectId.isValid(teamId) || !ObjectId.isValid(playerId)) {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }
        
        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
        if (!team) {
            return res.status(404).json({ message: 'Team not found.' });
        }

        if (!team.captain.equals(requesterId)) {
            return res.status(403).json({ message: 'Forbidden: Only the team captain can remove players.' });
        }

        const playerToRemoveId = new ObjectId(playerId);

        if (team.captain.equals(playerToRemoveId)) {
            return res.status(400).json({ message: 'Captain cannot be removed from the team.' });
        }

        const result = await db.collection('teams').updateOne(
            { _id: new ObjectId(teamId) },
            { $pull: { players: playerToRemoveId } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Player not found in this team.' });
        }
        
        const notification = {
            userId: playerToRemoveId,
            message: `You have been removed from the team "${team.name}".`,
            type: 'team_removal',
            isRead: false,
            createdAt: new Date(),
            data: {
                teamId: team._id,
                teamName: team.name
            }
        };
        await db.collection('notifications').insertOne(notification);

        res.status(200).json({ message: 'Player removed successfully from the team.' });

    } catch (error) {
        console.error("Error removing player:", error);
        res.status(500).json({ message: 'Server error while removing player.' });
    }
};