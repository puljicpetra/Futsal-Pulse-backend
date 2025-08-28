import { ObjectId } from 'mongodb'
import { validationResult } from 'express-validator'

export const createTeam = async (req, res, db) => {
    if (req.user.role !== 'player') {
        return res.status(403).json({ message: 'Forbidden: Only players can create teams.' })
    }

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        const { name } = req.body
        const captainId = new ObjectId(req.user.id)

        const existingTeam = await db.collection('teams').findOne({ name })
        if (existingTeam) {
            return res.status(409).json({ message: 'A team with that name already exists.' })
        }

        const newTeam = {
            name,
            captain: captainId,
            players: [captainId],
            createdAt: new Date(),
        }

        const result = await db.collection('teams').insertOne(newTeam)

        const createdTeam = await db.collection('teams').findOne({ _id: result.insertedId })

        res.status(201).json({
            message: 'Team created successfully!',
            team: createdTeam,
        })
    } catch (error) {
        console.error('Error creating team:', error)
        res.status(500).json({ message: 'Server error while creating team.' })
    }
}

export const getMyTeams = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id)

        const query = {
            $or: [{ players: userId }, { captain: userId }],
        }
        const teams = await db.collection('teams').find(query).toArray()

        res.status(200).json(teams)
    } catch (error) {
        console.error("Error fetching user's teams:", error)
        res.status(500).json({ message: 'Server error while fetching teams.' })
    }
}

export const getTeamById = async (req, res, db) => {
    try {
        const { id } = req.params
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid team ID format.' })
        }

        const pipeline = [
            { $match: { _id: new ObjectId(id) } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'players',
                    foreignField: '_id',
                    as: 'playerDetails',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'captain',
                    foreignField: '_id',
                    as: 'captainDetails',
                },
            },
            { $unwind: { path: '$captainDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    name: 1,
                    createdAt: 1,
                    'captainDetails.username': 1,
                    'captainDetails.full_name': 1,
                    'captainDetails._id': 1,
                    players: {
                        $map: {
                            input: '$playerDetails',
                            as: 'player',
                            in: {
                                _id: '$$player._id',
                                username: '$$player.username',
                                full_name: '$$player.full_name',
                                profile_image_url: '$$player.profile_image_url',
                            },
                        },
                    },
                },
            },
        ]

        const result = await db.collection('teams').aggregate(pipeline).toArray()

        if (result.length === 0) {
            return res.status(404).json({ message: 'Team not found.' })
        }

        const team = result[0]
        if (team.captainDetails) {
            team.captain = team.captainDetails
            delete team.captainDetails
        }

        res.status(200).json(team)
    } catch (error) {
        console.error('Error fetching team by ID:', error)
        res.status(500).json({ message: 'Server error while fetching team.' })
    }
}

export const invitePlayer = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
    try {
        const { id: teamId } = req.params
        const { playerId } = req.body
        const requesterId = new ObjectId(req.user.id)

        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) })
        if (!team) return res.status(404).json({ message: 'Team not found.' })

        if (team.captain.toString() !== requesterId.toString()) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the team captain can invite players.' })
        }

        if (team.players && team.players.length >= 8) {
            return res.status(403).json({ message: 'Team is full. Cannot invite more players.' })
        }

        const playerToInviteId = new ObjectId(playerId)
        const playerToInvite = await db.collection('users').findOne({ _id: playerToInviteId })
        if (!playerToInvite) return res.status(404).json({ message: 'Player to invite not found.' })

        if (playerToInvite._id.equals(requesterId)) {
            return res.status(400).json({ message: 'You cannot invite yourself.' })
        }

        const playerAlreadyInTeam = team.players.some((p) => p.equals(playerToInviteId))
        if (playerAlreadyInTeam)
            return res.status(409).json({ message: 'This player is already in the team.' })

        const existingNotification = await db.collection('notifications').findOne({
            userId: playerToInvite._id,
            'data.teamId': team._id,
            type: 'team_invitation',
            isRead: false,
        })
        if (existingNotification)
            return res.status(409).json({ message: 'This player has already been invited.' })

        const notification = {
            userId: playerToInvite._id,
            message: `You have a new invitation to join the team "${team.name}".`,
            type: 'team_invitation',
            isRead: false,
            createdAt: new Date(),
            data: { teamId: team._id, teamName: team.name, inviterId: requesterId },
        }
        await db.collection('notifications').insertOne(notification)

        res.status(200).json({ message: `Invitation sent to ${playerToInvite.username}.` })
    } catch (error) {
        console.error('Error inviting player:', error)
        res.status(500).json({ message: 'Server error while sending invitation.' })
    }
}

export const removePlayerFromTeam = async (req, res, db) => {
    try {
        const { teamId, playerId } = req.params
        const requesterId = new ObjectId(req.user.id)

        if (!ObjectId.isValid(teamId) || !ObjectId.isValid(playerId)) {
            return res.status(400).json({ message: 'Invalid ID format.' })
        }

        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) })
        if (!team) return res.status(404).json({ message: 'Team not found.' })

        if (!team.captain.equals(requesterId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the team captain can remove players.' })
        }

        const playerToRemoveId = new ObjectId(playerId)

        if (team.captain.equals(playerToRemoveId)) {
            return res.status(400).json({ message: 'Captain cannot be removed from the team.' })
        }

        const result = await db
            .collection('teams')
            .updateOne({ _id: new ObjectId(teamId) }, { $pull: { players: playerToRemoveId } })

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Player not found in this team.' })
        }

        const notification = {
            userId: playerToRemoveId,
            message: `You have been removed from the team "${team.name}".`,
            type: 'team_removal',
            isRead: false,
            createdAt: new Date(),
            data: { teamId: team._id, teamName: team.name },
        }
        await db.collection('notifications').insertOne(notification)

        res.status(200).json({ message: 'Player removed successfully from the team.' })
    } catch (error) {
        console.error('Error removing player:', error)
        res.status(500).json({ message: 'Server error while removing player.' })
    }
}

export const deleteTeam = async (req, res, db) => {
    try {
        const { id: teamId } = req.params
        const requesterId = new ObjectId(req.user.id)

        if (!ObjectId.isValid(teamId)) {
            return res.status(400).json({ message: 'Invalid team ID format.' })
        }

        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) })
        if (!team) return res.status(404).json({ message: 'Team not found.' })

        if (!team.captain.equals(requesterId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the team captain can delete the team.' })
        }

        const teamName = team.name
        const playerIds = team.players.filter((pId) => !pId.equals(requesterId))

        await db.collection('registrations').deleteMany({ teamId: team._id })
        await db.collection('teams').deleteOne({ _id: team._id })

        if (playerIds.length > 0) {
            const notifications = playerIds.map((pId) => ({
                userId: pId,
                message: `The team "${teamName}" has been disbanded by the captain.`,
                type: 'team_deleted',
                isRead: false,
                createdAt: new Date(),
            }))
            await db.collection('notifications').insertMany(notifications)
        }

        res.status(200).json({ message: `Team "${teamName}" has been successfully deleted.` })
    } catch (error) {
        console.error('Error deleting team:', error)
        res.status(500).json({ message: 'Server error while deleting team.' })
    }
}
