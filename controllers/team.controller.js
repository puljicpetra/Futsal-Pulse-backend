import { ObjectId } from 'mongodb'
import { validationResult } from 'express-validator'

const isValidId = (id) => ObjectId.isValid(String(id))
const toObjectId = (id) => (isValidId(id) ? new ObjectId(id) : null)

export const getAllTeams = async (req, res, db) => {
    try {
        const pipeline = [
            { $sort: { createdAt: -1 } },

            {
                $lookup: {
                    from: 'users',
                    localField: 'captain',
                    foreignField: '_id',
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                username: 1,
                                full_name: 1,
                                profile_image_url: 1,
                            },
                        },
                    ],
                    as: 'captainInfo',
                },
            },
            { $addFields: { captain: { $arrayElemAt: ['$captainInfo', 0] } } },

            {
                $addFields: {
                    playersCount: {
                        $cond: [{ $isArray: '$players' }, { $size: '$players' }, 0],
                    },
                },
            },

            {
                $project: {
                    _id: 1,
                    name: 1,
                    captain: 1,
                    playersCount: 1,
                },
            },
        ]

        const teams = await db.collection('teams').aggregate(pipeline).toArray()
        return res.status(200).json(teams)
    } catch (error) {
        console.error('getAllTeams error:', error)
        return res.status(500).json({ message: 'Server error while fetching teams.' })
    }
}

export const getMyTeams = async (req, res, db) => {
    try {
        const userId = new ObjectId(req.user.id)

        const pipeline = [
            {
                $match: {
                    $or: [{ captain: userId }, { players: userId }],
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'captain',
                    foreignField: '_id',
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                username: 1,
                                full_name: 1,
                                profile_image_url: 1,
                            },
                        },
                    ],
                    as: 'captainInfo',
                },
            },
            { $addFields: { captain: { $arrayElemAt: ['$captainInfo', 0] } } },
            {
                $addFields: {
                    playersCount: {
                        $cond: [{ $isArray: '$players' }, { $size: '$players' }, 0],
                    },
                },
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    captain: 1,
                    playersCount: 1,
                    isCaptain: { $eq: ['$captain._id', userId] },
                },
            },
        ]

        const teams = await db.collection('teams').aggregate(pipeline).toArray()
        return res.status(200).json(teams)
    } catch (error) {
        console.error('getMyTeams error:', error)
        return res.status(500).json({ message: 'Server error while fetching your teams.' })
    }
}

export const getTeamById = async (req, res, db) => {
    const { id } = req.params
    if (!isValidId(id)) {
        return res.status(400).json({ message: 'Invalid team ID.' })
    }

    try {
        const pipeline = [
            { $match: { _id: new ObjectId(id) } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'captain',
                    foreignField: '_id',
                    pipeline: [
                        {
                            $project: {
                                _id: 1,
                                username: 1,
                                full_name: 1,
                                profile_image_url: 1,
                            },
                        },
                    ],
                    as: 'captainInfo',
                },
            },
            { $addFields: { captain: { $arrayElemAt: ['$captainInfo', 0] } } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'players',
                    foreignField: '_id',
                    pipeline: [
                        { $project: { _id: 1, username: 1, full_name: 1, profile_image_url: 1 } },
                    ],
                    as: 'playersInfo',
                },
            },
            {
                $addFields: {
                    playersCount: { $size: { $ifNull: ['$players', []] } },
                },
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    captain: 1,
                    players: '$playersInfo',
                    playersCount: 1,
                },
            },
        ]

        const teams = await db.collection('teams').aggregate(pipeline).toArray()
        if (teams.length === 0) {
            return res.status(404).json({ message: 'Team not found.' })
        }
        return res.status(200).json(teams[0])
    } catch (error) {
        console.error('getTeamById error:', error)
        return res.status(500).json({ message: 'Server error while fetching team.' })
    }
}

export const createTeam = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        const { name } = req.body
        const captainId = new ObjectId(req.user.id)

        const exists = await db
            .collection('teams')
            .findOne({ name: { $regex: `^${name}$`, $options: 'i' } })
        if (exists) {
            return res.status(409).json({ message: 'A team with that name already exists.' })
        }

        const teamDoc = {
            name,
            captain: captainId,
            players: [],
            createdAt: new Date(),
        }

        const result = await db.collection('teams').insertOne(teamDoc)
        const created = await db.collection('teams').findOne({ _id: result.insertedId })

        return res.status(201).json({ message: 'Team created successfully.', team: created })
    } catch (error) {
        console.error('createTeam error:', error)
        return res.status(500).json({ message: 'Server error while creating team.' })
    }
}

export const deleteTeam = async (req, res, db) => {
    const { id } = req.params
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid team ID.' })

    try {
        const userId = new ObjectId(req.user.id)
        const teamId = new ObjectId(id)

        const team = await db.collection('teams').findOne({ _id: teamId })
        if (!team) return res.status(404).json({ message: 'Team not found.' })
        if (!team.captain?.equals?.(userId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the captain can delete the team.' })
        }

        const [regCount, matchCount] = await Promise.all([
            db.collection('registrations').countDocuments({ teamId }),
            db.collection('matches').countDocuments({
                $or: [{ teamA_id: teamId }, { teamB_id: teamId }],
            }),
        ])

        if (regCount > 0 || matchCount > 0) {
            return res.status(409).json({
                message:
                    regCount > 0 && matchCount > 0
                        ? 'Cannot delete: team has registrations and matches. Remove/cancel them first.'
                        : regCount > 0
                        ? 'Cannot delete: team has registrations. Remove/cancel them first.'
                        : 'Cannot delete: team appears in matches. Delete those matches first.',
            })
        }

        await db.collection('teams').deleteOne({ _id: team._id })

        const notifyUsers = [...(team.players || [])].filter((uid) =>
            uid && uid.equals ? !uid.equals(userId) : true
        )
        if (notifyUsers.length) {
            const notifications = notifyUsers.map((uid) => ({
                userId: uid,
                type: 'team_deleted',
                message: `Team "${team.name}" has been deleted by the captain.`,
                data: { teamId: team._id },
                isRead: false,
                createdAt: new Date(),
            }))
            await db.collection('notifications').insertMany(notifications)
        }

        return res.status(200).json({ message: 'Team deleted successfully.' })
    } catch (error) {
        console.error('deleteTeam error:', error)
        return res.status(500).json({ message: 'Server error while deleting team.' })
    }
}

export const invitePlayer = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { id: teamId } = req.params
    const { playerId } = req.body

    if (!isValidId(teamId) || !isValidId(playerId)) {
        return res.status(400).json({ message: 'Invalid team or player ID.' })
    }

    try {
        const userId = new ObjectId(req.user.id)
        const teamObjId = new ObjectId(teamId)
        const playerObjId = new ObjectId(playerId)

        const team = await db.collection('teams').findOne({ _id: teamObjId })
        if (!team) return res.status(404).json({ message: 'Team not found.' })
        if (!team.captain?.equals?.(userId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the captain can invite players.' })
        }

        if (
            team.captain?.equals?.(playerObjId) ||
            (team.players || []).some((p) => p.equals(playerObjId))
        ) {
            return res.status(400).json({ message: 'Player is already a member of this team.' })
        }

        const existingMembership = await db.collection('teams').findOne({
            $or: [{ captain: playerObjId }, { players: playerObjId }],
        })
        if (existingMembership) {
            return res.status(400).json({
                message: 'Player already belongs to another team.',
            })
        }

        const existingInvite = await db.collection('notifications').findOne({
            userId: playerObjId,
            type: 'team_invitation',
            'data.teamId': teamObjId,
            isRead: false,
        })
        if (existingInvite) {
            return res.status(200).json({ message: 'Invitation already sent.' })
        }

        const captainUser = await db
            .collection('users')
            .findOne(
                { _id: team.captain },
                { projection: { _id: 1, username: 1, full_name: 1, profile_image_url: 1 } }
            )

        await db.collection('notifications').insertOne({
            userId: playerObjId,
            type: 'team_invitation',
            message: `You have been invited to join "${team.name}".`,
            data: { teamId: team._id, invitedBy: captainUser?._id || team.captain },
            isRead: false,
            createdAt: new Date(),
        })

        return res.status(201).json({ message: 'Invitation sent.' })
    } catch (error) {
        console.error('invitePlayer error:', error)
        return res.status(500).json({ message: 'Server error while sending invitation.' })
    }
}

export const removePlayerFromTeam = async (req, res, db) => {
    const { teamId, playerId } = req.params
    if (!isValidId(teamId) || !isValidId(playerId)) {
        return res.status(400).json({ message: 'Invalid IDs.' })
    }

    try {
        const userId = new ObjectId(req.user.id)
        const teamObjId = new ObjectId(teamId)
        const playerObjId = new ObjectId(playerId)

        const team = await db.collection('teams').findOne({ _id: teamObjId })
        if (!team) return res.status(404).json({ message: 'Team not found.' })
        if (!team.captain?.equals?.(userId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the captain can remove players.' })
        }

        const result = await db
            .collection('teams')
            .updateOne({ _id: teamObjId }, { $pull: { players: playerObjId } })

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Player not found in this team.' })
        }

        await db.collection('notifications').insertOne({
            userId: playerObjId,
            type: 'team_removal',
            message: `You have been removed from the team "${team.name}".`,
            data: { teamId: team._id },
            isRead: false,
            createdAt: new Date(),
        })

        return res.status(200).json({ message: 'Player removed from the team.' })
    } catch (error) {
        console.error('removePlayerFromTeam error:', error)
        return res.status(500).json({ message: 'Server error while removing player.' })
    }
}
