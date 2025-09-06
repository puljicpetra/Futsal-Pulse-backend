import { ObjectId } from 'mongodb'

export const searchPlayers = async (req, res, db) => {
    try {
        const q = String(req.query.q || '').trim()
        if (!q) return res.json([])

        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

        const raw = await db
            .collection('users')
            .find({ full_name: rx })
            .project({ _id: 1, full_name: 1, avatar_url: 1, username: 1 })
            .limit(20)
            .toArray()

        const players = raw.map((p) => ({
            _id: p._id,
            full_name: p.full_name,
            username: p.username,
            avatarUrl: p.avatar_url ?? null,
        }))

        res.json(players)
    } catch (e) {
        console.error('searchPlayers error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}

export const getPlayerStats = async (req, res, db) => {
    try {
        const { playerId } = req.params
        if (!ObjectId.isValid(playerId)) {
            return res.status(400).json({ message: 'Invalid player ID.' })
        }
        const { tournamentId } = req.query
        const match = { playerId: new ObjectId(playerId) }
        if (tournamentId && ObjectId.isValid(tournamentId)) {
            match.tournamentId = new ObjectId(tournamentId)
        }

        const agg = await db
            .collection('player_match_stats')
            .aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        apps: { $sum: 1 },
                        goals: { $sum: '$goals' },
                        yellowCards: { $sum: '$yc' },
                        redDirect: { $sum: '$rc_direct' },
                        redSecondYellow: { $sum: '$rc_second_yellow' },
                        pensScored: { $sum: '$pso_scored' },
                        pensMissed: { $sum: '$pso_missed' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        apps: 1,
                        goals: 1,
                        yellowCards: 1,
                        pensScored: 1,
                        pensMissed: 1,
                        redCards: { $add: ['$redDirect', '$redSecondYellow'] },
                    },
                },
            ])
            .toArray()

        const stats = agg[0] || {
            apps: 0,
            goals: 0,
            yellowCards: 0,
            redCards: 0,
            pensScored: 0,
            pensMissed: 0,
        }

        const user = await db
            .collection('users')
            .findOne(
                { _id: new ObjectId(playerId) },
                { projection: { _id: 1, full_name: 1, avatar_url: 1, username: 1 } }
            )

        const player = user
            ? {
                  _id: user._id,
                  full_name: user.full_name,
                  username: user.username,
                  avatarUrl: user.avatar_url ?? null,
              }
            : { _id: new ObjectId(playerId) }

        res.json({ playerId, tournamentId: tournamentId || null, player, stats })
    } catch (e) {
        console.error('getPlayerStats error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}

export const getPlayerMatchLog = async (req, res, db) => {
    try {
        const { playerId } = req.params
        if (!ObjectId.isValid(playerId)) {
            return res.status(400).json({ message: 'Invalid player ID.' })
        }
        const limitNum = Math.max(1, Math.min(50, Number(req.query.limit || 10)))

        const items = await db
            .collection('player_match_stats')
            .aggregate([
                { $match: { playerId: new ObjectId(playerId) } },
                {
                    $lookup: {
                        from: 'matches',
                        localField: 'matchId',
                        foreignField: '_id',
                        as: 'm',
                    },
                },
                { $unwind: '$m' },
                { $sort: { 'm.matchDate': -1 } },
                { $limit: limitNum },
                {
                    $lookup: {
                        from: 'teams',
                        localField: 'm.teamA_id',
                        foreignField: '_id',
                        as: 'tA',
                    },
                },
                { $unwind: { path: '$tA', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'teams',
                        localField: 'm.teamB_id',
                        foreignField: '_id',
                        as: 'tB',
                    },
                },
                { $unwind: { path: '$tB', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'tournaments',
                        localField: 'm.tournamentId',
                        foreignField: '_id',
                        as: 'tour',
                    },
                },
                { $unwind: { path: '$tour', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        matchId: '$m._id',
                        matchDate: '$m.matchDate',
                        stage: '$m.stage',
                        result_type: '$m.result_type',
                        score: '$m.score',
                        overtime_score: '$m.overtime_score',
                        penalty_shootout: '$m.penalty_shootout',
                        teamA: { _id: '$tA._id', name: '$tA.name' },
                        teamB: { _id: '$tB._id', name: '$tB.name' },
                        tournament: { _id: '$tour._id', name: '$tour.name' },
                        player: {
                            goals: '$goals',
                            yellowCards: '$yc',
                            redCards: { $add: ['$rc_direct', '$rc_second_yellow'] },
                            redCard: { $gt: [{ $add: ['$rc_direct', '$rc_second_yellow'] }, 0] },
                            pensScored: '$pso_scored',
                            pensMissed: '$pso_missed',
                        },
                    },
                },
            ])
            .toArray()

        res.json(items)
    } catch (e) {
        console.error('getPlayerMatchLog error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}
