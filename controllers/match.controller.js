import { ObjectId } from 'mongodb';

export const createMatch = async (req, res, db) => {
    const { tournamentId, teamA_id, teamB_id, matchDate, group } = req.body;
    const organizerId = new ObjectId(req.user.id);

    if (!tournamentId || !teamA_id || !teamB_id || !matchDate) {
        return res.status(400).json({ message: 'Tournament, both teams, and match date are required.' });
    }

    try {
        const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        if (!tournament.organizer.equals(organizerId)) {
            return res.status(403).json({ message: 'Forbidden: Only the tournament organizer can add matches.' });
        }

        const newMatch = {
            tournamentId: new ObjectId(tournamentId),
            teamA: {
                _id: new ObjectId(teamA_id)
            },
            teamB: {
                _id: new ObjectId(teamB_id)
            },
            score: {
                teamA: null,
                teamB: null
            },
            matchDate: new Date(matchDate),
            status: 'scheduled',
            group: group || null,
            createdAt: new Date()
        };

        const result = await db.collection('matches').insertOne(newMatch);

        res.status(201).json({ message: 'Match created successfully', matchId: result.insertedId });

    } catch (error) {
        console.error("Error creating match:", error);
        res.status(500).json({ message: 'Server error while creating match.' });
    }
};

export const getMatchesForTournament = async (req, res, db) => {
    const { tournamentId } = req.params;

    if (!ObjectId.isValid(tournamentId)) {
        return res.status(400).json({ message: 'Invalid tournament ID.' });
    }

    try {
        const pipeline = [
            { $match: { tournamentId: new ObjectId(tournamentId) } },
            { $sort: { matchDate: 1 } },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamA._id',
                    foreignField: '_id',
                    as: 'teamADetails'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamB._id',
                    foreignField: '_id',
                    as: 'teamBDetails'
                }
            },
            {
                $project: {
                    "teamA.name": { $arrayElemAt: ["$teamADetails.name", 0] },
                    "teamB.name": { $arrayElemAt: ["$teamBDetails.name", 0] },
                    "teamA._id": 1,
                    "teamB._id": 1,
                    score: 1,
                    matchDate: 1,
                    status: 1,
                    group: 1
                }
            }
        ];

        const matches = await db.collection('matches').aggregate(pipeline).toArray();

        res.status(200).json(matches);
    } catch (error) {
        console.error("Error fetching matches:", error);
        res.status(500).json({ message: 'Server error while fetching matches.' });
    }
};

export const updateMatch = async (req, res, db) => {
    res.status(501).json({ message: 'Not implemented yet.' });
};

export const deleteMatch = async (req, res, db) => {
    const { matchId } = req.params;
    const organizerId = new ObjectId(req.user.id);

    if (!ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Invalid match ID.' });
    }

    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }

        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId });
        if (!tournament) {
            return res.status(404).json({ message: 'Associated tournament not found.' });
        }
        if (!tournament.organizer.equals(organizerId)) {
            return res.status(403).json({ message: 'Forbidden: Only the tournament organizer can delete matches.' });
        }

        await db.collection('matches').deleteOne({ _id: new ObjectId(matchId) });

        res.status(200).json({ message: 'Match deleted successfully.' });

    } catch (error) {
        console.error("Error deleting match:", error);
        res.status(500).json({ message: 'Server error while deleting match.' });
    }
};