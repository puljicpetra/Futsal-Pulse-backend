import { ObjectId } from 'mongodb';

export const createRegistration = async (req, res, db) => {
    try {
        const { teamId, tournamentId } = req.body;
        const userId = new ObjectId(req.user.id);

        if (!teamId || !tournamentId) {
            return res.status(400).json({ message: 'Team ID and Tournament ID are required.' });
        }
        if (!ObjectId.isValid(teamId) || !ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }

        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) });
        if (!team) {
            return res.status(404).json({ message: 'Team not found.' });
        }
        if (team.captain.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Forbidden: Only the team captain can register the team.' });
        }

        const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        const existingRegistration = await db.collection('registrations').findOne({
            teamId: new ObjectId(teamId),
            tournamentId: new ObjectId(tournamentId)
        });
        if (existingRegistration) {
            return res.status(409).json({ message: 'This team is already registered for this tournament.' });
        }

        const newRegistration = {
            teamId: new ObjectId(teamId),
            tournamentId: new ObjectId(tournamentId),
            status: 'pending',
            registeredAt: new Date()
        };
        await db.collection('registrations').insertOne(newRegistration);
        
        res.status(201).json({ message: 'Team successfully registered for the tournament. Waiting for organizer approval.' });

    } catch (error) {
        console.error("Error creating registration:", error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};


export const getRegistrationsForTournament = async (req, res, db) => {
    try {
        const { tournamentId } = req.query;
        if (!tournamentId || !ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ message: 'A valid tournament ID is required.' });
        }

        const pipeline = [
            { $match: { tournamentId: new ObjectId(tournamentId) } },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamId',
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
                $project: {
                    _id: 1,
                    status: 1,
                    registeredAt: 1,
                    team: {
                        _id: '$teamDetails._id',
                        name: '$teamDetails.name',
                    },
                    captain: {
                        _id: '$captainDetails._id',
                        username: '$captainDetails.username',
                        fullName: '$captainDetails.full_name'
                    }
                }
            }
        ];

        const registrations = await db.collection('registrations').aggregate(pipeline).toArray();
        res.status(200).json(registrations);

    } catch (error) {
        console.error("Error fetching registrations:", error);
        res.status(500).json({ message: 'Server error while fetching registrations.' });
    }
};