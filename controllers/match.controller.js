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

export const addEventValidationRules = () => [
    body('type').isIn(['goal', 'yellow-card', 'red-card']).withMessage('Event type is invalid.'),
    body('minute').isInt({ min: 1 }).withMessage('Minute must be a positive number.'),
    body('teamId').isMongoId().withMessage('Valid team ID is required.'),
    body('playerId').isMongoId().withMessage('Valid player ID is required.')
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
        if (!tournament) return res.status(404).json({ message: 'Tournament not found.' });
        if (!tournament.organizer.equals(organizerId)) return res.status(403).json({ message: 'Forbidden: Only the tournament organizer can add matches.' });
        
        const newMatch = {
            tournamentId: new ObjectId(tournamentId),
            teamA_id: new ObjectId(teamA_id),
            teamB_id: new ObjectId(teamB_id),
            score: { teamA: 0, teamB: 0 },
            matchDate: new Date(matchDate),
            status: 'scheduled',
            group: group || null,
            events: [],
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
            { $lookup: { from: 'tournaments', localField: 'tournamentId', foreignField: '_id', as: 'tournamentDetails' } },
            { $unwind: { path: '$tournamentDetails', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'teams', localField: 'teamA_id', foreignField: '_id', as: 'teamADetails' } },
            { $unwind: { path: '$teamADetails', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'teams', localField: 'teamB_id', foreignField: '_id', as: 'teamBDetails' } },
            { $unwind: { path: '$teamBDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1, score: 1, matchDate: 1, status: 1, group: 1, events: 1,
                    tournament: { _id: '$tournamentDetails._id', name: '$tournamentDetails.name', city: '$tournamentDetails.location.city' },
                    teamA: { _id: '$teamADetails._id', name: '$teamADetails.name' },
                    teamB: { _id: '$teamBDetails._id', name: '$teamBDetails.name' }
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
    if (!ObjectId.isValid(tournamentId)) 
        return res.status(400).json({ message: 'Invalid tournament ID.' });

    try {
        const pipeline = [
            { $match: { tournamentId: new ObjectId(tournamentId) } },
            { $sort: { matchDate: 1 } },
            
            { $lookup: { from: 'teams', localField: 'teamA_id', foreignField: '_id', as: 'teamA' } },
            { $unwind: { path: '$teamA', preserveNullAndEmptyArrays: true } },
            
            { $lookup: { from: 'teams', localField: 'teamB_id', foreignField: '_id', as: 'teamB' } },
            { $unwind: { path: '$teamB', preserveNullAndEmptyArrays: true } },

            { $lookup: { from: 'users', localField: 'teamA.players', foreignField: '_id', as: 'teamA.players' } },
            
            { $lookup: { from: 'users', localField: 'teamB.players', foreignField: '_id', as: 'teamB.players' } },
            
            {
                $project: {
                    _id: 1, score: 1, matchDate: 1, status: 1, group: 1, events: 1,
                    teamA: {
                        _id: '$teamA._id',
                        name: '$teamA.name',
                        players: {
                            $map: {
                                input: "$teamA.players",
                                as: "player",
                                in: { _id: "$$player._id", name: "$$player.full_name" }
                            }
                        }
                    },
                    teamB: {
                        _id: '$teamB._id',
                        name: '$teamB.name',
                        players: {
                            $map: {
                                input: "$teamB.players",
                                as: "player",
                                in: { _id: "$$player._id", name: "$$player.full_name" }
                            }
                        }
                    }
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

export const finishMatch = async (req, res, db) => {
    const { matchId } = req.params;
    const requesterId = new ObjectId(req.user.id);
    if (!ObjectId.isValid(matchId)) 
        return res.status(400).json({ message: 'Invalid match ID.' });
    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
        if (!match) 
            return res.status(404).json({ message: 'Match not found.' });
        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId });
        if (!tournament || !tournament.organizer.equals(requesterId)) 
            return res.status(403).json({ message: 'Forbidden: Only the tournament organizer can perform this action.' });
        if (match.status === 'finished') 
            return res.status(400).json({ message: 'This match has already been marked as finished.' });
        await db.collection('matches').updateOne({ _id: new ObjectId(matchId) }, { $set: { status: 'finished' } });
        const updatedMatch = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
        res.status(200).json({ message: 'Match marked as finished.', match: updatedMatch });
    } catch (error) {
        console.error("Error finishing match:", error);
        res.status(500).json({ message: 'Server error while finishing match.' });
    }
};

export const deleteMatch = async (req, res, db) => {
    const { matchId } = req.params;
    const organizerId = new ObjectId(req.user.id);
    if (!ObjectId.isValid(matchId)) 
        return res.status(400).json({ message: 'Invalid match ID.' });
    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
        if (!match) 
            return res.status(404).json({ message: 'Match not found.' });
        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId });
        if (!tournament || !tournament.organizer.equals(organizerId)) 
            return res.status(403).json({ message: 'Forbidden: Only the tournament organizer can delete matches.' });
        await db.collection('matches').deleteOne({ _id: new ObjectId(matchId) });
        res.status(200).json({ message: 'Match deleted successfully.' });
    } catch (error) {
        console.error("Error deleting match:", error);
        res.status(500).json({ message: 'Server error while deleting match.' });
    }
};

export const addMatchEvent = async (req, res, db) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        return res.status(400).json({ errors: errors.array() });

    const { matchId } = req.params;
    const { type, minute, teamId, playerId } = req.body;
    const requesterId = new ObjectId(req.user.id);

    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
        if (!match) 
            return res.status(404).json({ message: "Match not found." });
        if (match.status === 'finished') 
            return res.status(400).json({ message: 'Cannot add events to a finished match.' });

        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId });
        if (!tournament || !tournament.organizer.equals(requesterId)) 
            return res.status(403).json({ message: "Forbidden: You are not the organizer." });

        const newEvent = {
            _id: new ObjectId(),
            type,
            minute: parseInt(minute, 10),
            teamId: new ObjectId(teamId),
            playerId: new ObjectId(playerId),
            createdAt: new Date()
        };

        const updateOperation = { $push: { events: newEvent } };

        if (type === 'goal') {
            const scoreField = match.teamA_id.equals(teamId) ? 'score.teamA' : 'score.teamB';
            updateOperation.$inc = { [scoreField]: 1 };
        }

        await db.collection('matches').updateOne({ _id: new ObjectId(matchId) }, updateOperation);
        
        const finalMatchResult = await db.collection('matches').aggregate([
            { $match: { _id: new ObjectId(matchId) } },
            { $lookup: { from: 'teams', localField: 'teamA_id', foreignField: '_id', as: 'teamA' } },
            { $unwind: { path: '$teamA', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'teams', localField: 'teamB_id', foreignField: '_id', as: 'teamB' } },
            { $unwind: { path: '$teamB', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'users', localField: 'teamA.players', foreignField: '_id', as: 'teamA.players' } },
            { $lookup: { from: 'users', localField: 'teamB.players', foreignField: '_id', as: 'teamB.players' } },
            {
                $project: {
                    _id: 1, score: 1, matchDate: 1, status: 1, group: 1, events: 1,
                    teamA: {
                        _id: '$teamA._id', name: '$teamA.name',
                        players: { $map: { input: "$teamA.players", as: "p", in: { _id: "$$p._id", name: "$$p.full_name" } } }
                    },
                    teamB: {
                        _id: '$teamB._id', name: '$teamB.name',
                        players: { $map: { input: "$teamB.players", as: "p", in: { _id: "$$p._id", name: "$$p.full_name" } } }
                    }
                }
            }
        ]).toArray();

        res.status(200).json({ message: 'Event added successfully.', match: finalMatchResult[0] });

    } catch (error) {
        console.error("Error adding match event:", error);
        res.status(500).json({ message: 'Server error while adding event.' });
    }
};

export const deleteMatchEvent = async (req, res, db) => {
    const { matchId, eventId } = req.params;
    const requesterId = new ObjectId(req.user.id);

    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
        if (!match) 
            return res.status(404).json({ message: "Match not found." });
        if (match.status === 'finished') 
            return res.status(400).json({ message: 'Cannot remove events from a finished match.' });

        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId });
        if (!tournament || !tournament.organizer.equals(requesterId)) 
            return res.status(403).json({ message: "Forbidden: You are not the organizer." });

        const eventToDelete = match.events.find(e => e._id.equals(eventId));
        if (!eventToDelete) 
            return res.status(404).json({ message: 'Event not found.' });
        
        const updateOperation = { $pull: { events: { _id: new ObjectId(eventId) } } };

        if (eventToDelete.type === 'goal') {
            const scoreField = match.teamA_id.equals(eventToDelete.teamId) ? 'score.teamA' : 'score.teamB';
            updateOperation.$inc = { [scoreField]: -1 };
        }

        await db.collection('matches').updateOne({ _id: new ObjectId(matchId) }, updateOperation);
        
        const finalMatchResult = await db.collection('matches').aggregate([
            { $match: { _id: new ObjectId(matchId) } },
            { $lookup: { from: 'teams', localField: 'teamA_id', foreignField: '_id', as: 'teamA' } },
            { $unwind: { path: '$teamA', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'teams', localField: 'teamB_id', foreignField: '_id', as: 'teamB' } },
            { $unwind: { path: '$teamB', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'users', localField: 'teamA.players', foreignField: '_id', as: 'teamA.players' } },
            { $lookup: { from: 'users', localField: 'teamB.players', foreignField: '_id', as: 'teamB.players' } },
            {
                $project: {
                    _id: 1, score: 1, matchDate: 1, status: 1, group: 1, events: 1,
                    teamA: {
                        _id: '$teamA._id', name: '$teamA.name',
                        players: { $map: { input: "$teamA.players", as: "p", in: { _id: "$$p._id", name: "$$p.full_name" } } }
                    },
                    teamB: {
                        _id: '$teamB._id', name: '$teamB.name',
                        players: { $map: { input: "$teamB.players", as: "p", in: { _id: "$$p._id", name: "$$p.full_name" } } }
                    }
                }
            }
        ]).toArray();

        res.status(200).json({ message: 'Event removed successfully.', match: finalMatchResult[0] });

    } catch (error) {
        console.error("Error deleting match event:", error);
        res.status(500).json({ message: 'Server error while deleting event.' });
    }
};