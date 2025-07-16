import { ObjectId } from 'mongodb';

export const createTeam = async (req, res, db) => {
    if (req.user.role !== 'player') {
        return res.status(403).json({ message: 'Forbidden: Only players can create teams.' });
    }

    try {
        const { name, tournamentId } = req.body;
        const captainId = new ObjectId(req.user.id);

        if (!name || !tournamentId) {
            return res.status(400).json({ message: 'Team name and tournament ID are required.' });
        }
        if (!ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ message: 'Invalid tournament ID format.' });
        }

        const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        const existingTeam = await db.collection('teams').findOne({
            tournamentId: new ObjectId(tournamentId),
            captain: captainId
        });

        if (existingTeam) {
            return res.status(409).json({ message: 'You have already registered a team for this tournament.' });
        }

        const newTeam = {
            name,
            captain: captainId,
            players: [captainId],
            tournamentId: new ObjectId(tournamentId),
            status: 'approved',
            createdAt: new Date(),
        };

        const result = await db.collection('teams').insertOne(newTeam);
        const newTeamId = result.insertedId;

        await db.collection('tournaments').updateOne(
            { _id: new ObjectId(tournamentId) },
            { $push: { teams: newTeamId } }
        );

        res.status(201).json({ 
            message: 'Team created and registered successfully!', 
            team: { _id: newTeamId, ...newTeam }
        });

    } catch (error) {
        console.error("Error creating team:", error);
        res.status(500).json({ message: 'Server error while creating team.' });
    }
};

export const getTeamsForTournament = async (req, res, db) => {
    try {
        const { tournamentId } = req.query;
        if (!tournamentId || !ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ message: 'A valid tournament ID is required.' });
        }

        const pipeline = [
            {
                $match: { tournamentId: new ObjectId(tournamentId) }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'captain',
                    foreignField: '_id',
                    as: 'captainInfo'
                }
            },
            {
                $unwind: '$captainInfo'
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    tournamentId: 1,
                    status: 1,
                    captain: {
                        _id: '$captainInfo._id',
                        username: '$captainInfo.username'
                    }
                }
            }
        ];

        const teams = await db.collection('teams').aggregate(pipeline).toArray();

        res.status(200).json(teams);

    } catch (error) {
        console.error("Error fetching teams for tournament:", error);
        res.status(500).json({ message: 'Server error while fetching teams.' });
    }
};