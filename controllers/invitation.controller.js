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

        const teamId = notification.data.teamId
        const teamName = notification.data.teamName

        const team = await db.collection('teams').findOne({ _id: new ObjectId(teamId) })
        if (!team) {
            await db.collection('notifications').deleteOne({ _id: notification._id })
            return res.status(404).json({ message: 'The team no longer exists.' })
        }
        const captainId = team.captain

        await db.collection('notifications').deleteOne({ _id: notification._id })

        const playerName = respondingUser.full_name || respondingUser.username

        if (response === 'accepted') {
            if (team.players && team.players.length >= 8) {
                return res
                    .status(403)
                    .json({ message: `Cannot join team "${teamName}" because it is already full.` })
            }

            await db
                .collection('teams')
                .updateOne({ _id: new ObjectId(teamId) }, { $addToSet: { players: userId } })

            const captainNotification = {
                userId: captainId,
                message: `${playerName} has accepted your invitation to join "${teamName}".`,
                type: 'invitation_accepted',
                isRead: false,
                createdAt: new Date(),
                link: `/teams/${teamId}`,
                data: { teamId: teamId, playerId: userId },
            }
            await db.collection('notifications').insertOne(captainNotification)

            return res.status(200).json({ message: `Successfully joined team ${teamName}.` })
        } else {
            const captainNotification = {
                userId: captainId,
                message: `${playerName} has rejected your invitation to join "${teamName}".`,
                type: 'invitation_rejected',
                isRead: false,
                createdAt: new Date(),
                link: '#',
                data: { teamId: teamId, playerId: userId },
            }
            await db.collection('notifications').insertOne(captainNotification)

            return res.status(200).json({ message: `Invitation for team ${teamName} rejected.` })
        }
    } catch (error) {
        console.error('Error responding to invitation:', error)
        res.status(500).json({ message: 'Server error while responding to invitation.' })
    }
}
