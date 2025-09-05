import { ObjectId } from 'mongodb'
import { validationResult } from 'express-validator'

const toObjectId = (v) => {
    if (!v) return null
    if (typeof v === 'string' && ObjectId.isValid(v)) return new ObjectId(v)
    if (typeof v === 'object' && typeof v.$oid === 'string' && ObjectId.isValid(v.$oid)) {
        return new ObjectId(v.$oid)
    }
    return null
}

export const respondToInvitation = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        const notifOid = toObjectId(req.params.id)
        if (!notifOid) {
            return res.status(400).json({ message: 'Invalid invitation ID format.' })
        }

        const { response } = req.body
        const userId = new ObjectId(req.user.id)

        const respondingUser = await db.collection('users').findOne({ _id: userId })
        if (!respondingUser) {
            return res.status(404).json({ message: 'Responding user not found.' })
        }

        const notification = await db.collection('notifications').findOne({
            _id: notifOid,
            userId: userId,
            type: 'team_invitation',
        })

        if (!notification) {
            return res.status(404).json({
                message: 'Invitation not found, already processed, or not addressed to you.',
            })
        }

        const teamObjId = toObjectId(notification?.data?.teamId)
        if (!teamObjId) {
            return res.status(400).json({ message: 'Invalid team ID in invitation.' })
        }

        const team = await db.collection('teams').findOne({ _id: teamObjId })
        if (!team) {
            await db.collection('notifications').deleteOne({ _id: notification._id })
            return res.status(404).json({ message: 'The team no longer exists.' })
        }

        const teamName = notification?.data?.teamName || team.name || 'team'
        const captainId = team.captain
        const playerName = respondingUser.full_name || respondingUser.username

        if (response === 'accepted') {
            if (Array.isArray(team.players) && team.players.length >= 8) {
                return res
                    .status(403)
                    .json({ message: `Cannot join team "${teamName}" because it is already full.` })
            }

            const existingMembership = await db.collection('teams').findOne({
                $or: [{ captain: userId }, { players: userId }],
            })
            if (existingMembership && !existingMembership._id.equals(teamObjId)) {
                return res.status(400).json({ message: 'Player already belongs to another team.' })
            }

            const upd = await db
                .collection('teams')
                .updateOne({ _id: teamObjId }, { $addToSet: { players: userId } })

            await db.collection('notifications').insertOne({
                userId: captainId,
                message: `${playerName} has accepted your invitation to join "${teamName}".`,
                type: 'invitation_accepted',
                isRead: false,
                createdAt: new Date(),
                link: `/teams/${String(teamObjId)}`,
                data: { teamId: teamObjId, playerId: userId },
            })

            await db.collection('notifications').deleteOne({ _id: notification._id })

            return res.status(200).json({
                message:
                    upd.modifiedCount === 0
                        ? `You were already a member of ${teamName}.`
                        : `Successfully joined team ${teamName}.`,
            })
        } else {
            await db.collection('notifications').insertOne({
                userId: captainId,
                message: `${playerName} has rejected your invitation to join "${teamName}".`,
                type: 'invitation_rejected',
                isRead: false,
                createdAt: new Date(),
                link: `/teams/${String(teamObjId)}`,
                data: { teamId: teamObjId, playerId: userId },
            })

            await db.collection('notifications').deleteOne({ _id: notification._id })

            return res.status(200).json({ message: `Invitation for team ${teamName} rejected.` })
        }
    } catch (error) {
        console.error('Error responding to invitation:', error)
        res.status(500).json({ message: 'Server error while responding to invitation.' })
    }
}
