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
        
        const playersToRegister = team.players;

        const existingTeamsOnTournament = await db.collection('registrations')
            .find({ tournamentId: new ObjectId(tournamentId), status: 'approved' })
            .project({ teamId: 1, _id: 0 })
            .toArray();

        const existingTeamIds = existingTeamsOnTournament.map(reg => reg.teamId);

        if (existingTeamIds.length > 0) {
            const teams = await db.collection('teams').find({ _id: { $in: existingTeamIds } }).project({ players: 1 }).toArray();
            const allPlayersOnTournament = teams.flatMap(t => t.players.map(p => p.toString()));
            const uniquePlayersOnTournament = [...new Set(allPlayersOnTournament)];

            const conflictingPlayer = playersToRegister.find(p => uniquePlayersOnTournament.includes(p.toString()));
            
            if (conflictingPlayer) {
                const userDetails = await db.collection('users').findOne({ _id: conflictingPlayer }, { projection: { username: 1 } });
                const username = userDetails ? userDetails.username : 'A player';
                return res.status(409).json({ message: `${username} from your team is already registered for this tournament with another team.` });
            }
        }

        const newRegistration = {
            teamId: new ObjectId(teamId),
            tournamentId: new ObjectId(tournamentId),
            status: 'pending',
            registeredAt: new Date()
        };
        await db.collection('registrations').insertOne(newRegistration);

        const notificationForOrganizer = {
            userId: tournament.organizer,
            message: `New team "${team.name}" has registered for your tournament "${tournament.name}".`,
            type: 'new_registration',
            isRead: false,
            createdAt: new Date(),
            link: `/tournaments/${tournament._id}`
        };
        await db.collection('notifications').insertOne(notificationForOrganizer);
        
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
            { $lookup: { from: 'teams', localField: 'teamId', foreignField: '_id', as: 'teamDetails' } },
            { $unwind: '$teamDetails' },
            { $lookup: { from: 'users', localField: 'teamDetails.captain', foreignField: '_id', as: 'captainDetails' } },
            { $unwind: '$captainDetails' },
            {
                $project: {
                    _id: 1,
                    status: 1,
                    registeredAt: 1,
                    team: { _id: '$teamDetails._id', name: '$teamDetails.name' },
                    captain: { _id: '$captainDetails._id', username: '$captainDetails.username', fullName: '$captainDetails.full_name' }
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

export const updateRegistrationStatus = async (req, res, db) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const organizerId = new ObjectId(req.user.id);

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid registration ID format.' });
        }
        
        const validStatuses = ['approved', 'rejected', 'withdrawal_approved'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status provided.' });
        }

        const registration = await db.collection('registrations').findOne({ _id: new ObjectId(id) });
        if (!registration) {
            return res.status(404).json({ message: 'Registration not found.' });
        }

        const tournament = await db.collection('tournaments').findOne({ _id: registration.tournamentId });
        if (!tournament) {
            return res.status(404).json({ message: 'Associated tournament not found.' });
        }
        if (!tournament.organizer.equals(organizerId)) {
            return res.status(403).json({ message: 'Forbidden: You are not the organizer of this tournament.' });
        }

        const team = await db.collection('teams').findOne({_id: registration.teamId});
        if (!team) {
            return res.status(404).json({ message: 'Associated team not found.' });
        }
        
        const notificationLink = `/tournaments/${tournament._id}`;

        if (status === 'withdrawal_approved') {
            await db.collection('registrations').deleteOne({ _id: registration._id });

            const notificationMessage = `Your team "${team.name}" has been successfully withdrawn from the tournament "${tournament.name}".`;
            const notifications = team.players.map(pId => ({
                userId: pId,
                message: notificationMessage,
                type: 'withdrawal_approved',
                isRead: false,
                createdAt: new Date(),
                link: notificationLink,
                data: { tournamentId: tournament._id }
            }));

            if(notifications.length > 0) {
                await db.collection('notifications').insertMany(notifications);
            }
            
            return res.status(200).json({ message: 'Team withdrawal approved and registration removed.' });
        } else {
            await db.collection('registrations').updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: status } }
            );

            const notificationMessage = `The status of your team "${team.name}" for the tournament "${tournament.name}" has been updated to: ${status}.`;
            const notifications = team.players.map(pId => ({
                userId: pId,
                message: notificationMessage,
                type: 'registration_update',
                isRead: false,
                createdAt: new Date(),
                link: notificationLink,
                data: { tournamentId: tournament._id }
            }));
             if(notifications.length > 0) {
                await db.collection('notifications').insertMany(notifications);
            }

            return res.status(200).json({ message: `Registration status updated to ${status}.` });
        }

    } catch (error) {
        console.error("Error updating registration status:", error);
        res.status(500).json({ message: 'Server error while updating status.' });
    }
};

export const requestWithdrawal = async (req, res, db) => {
    try {
        const { registrationId } = req.params;
        const requesterId = new ObjectId(req.user.id);

        if (!ObjectId.isValid(registrationId)) {
            return res.status(400).json({ message: 'Invalid registration ID format.' });
        }
        
        const registration = await db.collection('registrations').findOne({ _id: new ObjectId(registrationId) });
        if (!registration) {
            return res.status(404).json({ message: 'Registration not found.' });
        }

        const team = await db.collection('teams').findOne({ _id: registration.teamId });
        if (!team || !team.captain.equals(requesterId)) {
            return res.status(403).json({ message: 'Forbidden: Only the team captain can request a withdrawal.' });
        }

        const tournament = await db.collection('tournaments').findOne({ _id: registration.tournamentId });
        if (!tournament) {
            return res.status(404).json({ message: 'Associated tournament not found.' });
        }

        await db.collection('registrations').updateOne(
            { _id: registration._id },
            { $set: { status: 'pending_withdrawal' } }
        );

        const notification = {
            userId: tournament.organizer,
            message: `Team "${team.name}" has requested to withdraw from the tournament "${tournament.name}".`,
            type: 'withdrawal_request',
            isRead: false,
            createdAt: new Date(),
            link: `/tournaments/${tournament._id}`,
            data: {
                tournamentId: tournament._id,
                teamId: team._id,
                registrationId: registration._id
            }
        };
        await db.collection('notifications').insertOne(notification);

        res.status(200).json({ message: 'Withdrawal request sent to the organizer.' });
    } catch (error) {
        console.error("Error requesting withdrawal:", error);
        res.status(500).json({ message: 'Server error while requesting withdrawal.' });
    }
};