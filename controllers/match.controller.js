import { ObjectId } from 'mongodb';
import { body, validationResult } from 'express-validator';

export const createMatchValidationRules = () => [
    body('tournamentId').isMongoId().withMessage('Valid tournament ID is required.'),
    body('teamA_id').isMongoId().withMessage('Valid Team A ID is required.'),
    body('teamB_id').isMongoId().withMessage('Valid Team B ID is required.')
        .custom((value, { req }) => {
            if (value === req.body.teamA_id) {
                throw new Error('Team A and Team B cannot be the same team.');
            }
            return true;
        }),
    body('matchDate').isISO8601().toDate().withMessage('Valid match date is required.'),
    body('group').optional().trim().isString()
];

export const createMatch = async (req, res, db) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { tournamentId, teamA_id, teamB_id, matchDate, group } = req.body;
    const organizerId = new ObjectId(req.user.id);

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
            teamA_id: new ObjectId(teamA_id),
            teamB_id: new ObjectId(teamB_id),
            score: { teamA: null, teamB: null },
            matchDate: new Date(matchDate),
            status: 'scheduled',
            group: group || null,
            createdAt: new Date()
        };

        const result = await db.collection('matches').insertOne(newMatch);
        const createdMatch = await db.collection('matches').findOne({ _id: result.insertedId });

        res.status(201).json({ message: 'Match created successfully', match: createdMatch });

    } catch (error) {
        console.error("Error creating match:", error);
        res.status(500).json({ message: 'Server error while creating match.' });
    }
};

export const getAllMatches = async (req, res, db) => {
    try {
        const pipeline = [
            { $sort: { matchDate: 1 } },
            {
                $lookup: {
                    from: 'tournaments',
                    localField: 'tournamentId',
                    foreignField: '_id',
                    as: 'tournamentDetails'
                }
            },
            { $unwind: { path: '$tournamentDetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamA_id',
                    foreignField: '_id',
                    as: 'teamADetails'
                }
            },
            { $unwind: { path: '$teamADetails', preserveNullAndEmptyArrays: true } },
             {
                $lookup: {
                    from: 'teams',
                    localField: 'teamB_id',
                    foreignField: '_id',
                    as: 'teamBDetails'
                }
            },
            { $unwind: { path: '$teamBDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    score: 1,
                    matchDate: 1,
                    status: 1,
                    group: 1,
                    tournament: { 
                        _id: '$tournamentDetails._id',
                        name: '$tournamentDetails.name',
                        city: '$tournamentDetails.location.city'
                    },
                    teamA: {
                         _id: '$teamADetails._id',
                         name: '$teamADetails.name'
                    },
                    teamB: {
                        _id: '$teamBDetails._id',
                        name: '$teamBDetails.name'
                    }
                }
            }
        ];

        const matches = await db.collection('matches').aggregate(pipeline).toArray();
        res.status(200).json(matches);

    } catch (error) {
        console.error("Error fetching all matches:", error);
        res.status(500).json({ message: 'Server error while fetching matches.' });
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
                    localField: 'teamA_id',
                    foreignField: '_id',
                    as: 'teamADetails'
                }
            },
            { $unwind: { path: '$teamADetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamB_id',
                    foreignField: '_id',
                    as: 'teamBDetails'
                }
            },
            { $unwind: { path: '$teamBDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    'teamA.name': '$teamADetails.name',
                    'teamB.name': '$teamBDetails.name',
                    'teamA._id': '$teamADetails._id',
                    'teamB._id': '$teamBDetails._id',
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
        console.error("Error fetching matches for tournament:", error);
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