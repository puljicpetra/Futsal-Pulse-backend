import { ObjectId } from 'mongodb'
import { recomputeAllPlayerStats } from '../services/playerStats.service.js'

function toPublicUrl(req, url) {
    if (!url) return null
    if (/^https?:\/\//i.test(url)) return url
    const base =
        process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host') || 'localhost:3001'}`
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`
}

export const searchPlayers = async (req, res, db) => {
    try {
        const q = String(req.query.q || '').trim()
        if (!q) return res.json([])

        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

        const raw = await db
            .collection('users')
            .find({ full_name: rx })
            .project({
                _id: 1,
                full_name: 1,
                username: 1,
                profile_image_url: 1,
                avatar_url: 1,
            })
            .limit(20)
            .toArray()

        const players = raw.map((p) => ({
            _id: p._id,
            full_name: p.full_name,
            username: p.username,
            avatarUrl: toPublicUrl(req, p.profile_image_url ?? p.avatar_url ?? null),
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
        const pid = new ObjectId(playerId)

        const { tournamentId } = req.query
        const match = { playerId: pid }
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
                        goals: 1,
                        yellowCards: 1,
                        pensScored: 1,
                        pensMissed: 1,
                        redCards: { $add: ['$redDirect', '$redSecondYellow'] },
                    },
                },
            ])
            .toArray()

        const teams = await db
            .collection('teams')
            .find({ $or: [{ captain: pid }, { players: pid }] })
            .project({ _id: 1 })
            .toArray()
        const teamIds = teams.map((t) => t._id)

        let apps = 0
        if (teamIds.length > 0) {
            const mf = {
                status: 'finished',
                $or: [{ teamA_id: { $in: teamIds } }, { teamB_id: { $in: teamIds } }],
            }
            if (match.tournamentId) mf.tournamentId = match.tournamentId
            apps = await db.collection('matches').countDocuments(mf)
        }

        const base = {
            apps,
            goals: 0,
            yellowCards: 0,
            redCards: 0,
            pensScored: 0,
            pensMissed: 0,
        }
        const stats = Object.assign(base, agg[0] || {})

        const user = await db.collection('users').findOne(
            { _id: pid },
            {
                projection: {
                    _id: 1,
                    full_name: 1,
                    username: 1,
                    profile_image_url: 1,
                    avatar_url: 1,
                },
            }
        )

        const player = user
            ? {
                  _id: user._id,
                  full_name: user.full_name,
                  username: user.username,
                  avatarUrl: toPublicUrl(req, user.profile_image_url ?? user.avatar_url ?? null),
              }
            : { _id: pid }

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
        const pid = new ObjectId(playerId)
        const limitNum = Math.max(1, Math.min(50, Number(req.query.limit || 10)))

        const teams = await db
            .collection('teams')
            .find({ $or: [{ captain: pid }, { players: pid }] })
            .project({ _id: 1 })
            .toArray()
        const teamIds = teams.map((t) => t._id)
        if (teamIds.length === 0) return res.json([])

        const items = await db
            .collection('matches')
            .aggregate([
                {
                    $match: {
                        $or: [{ teamA_id: { $in: teamIds } }, { teamB_id: { $in: teamIds } }],
                    },
                },
                { $sort: { matchDate: -1 } },
                { $limit: limitNum },
                {
                    $lookup: {
                        from: 'teams',
                        localField: 'teamA_id',
                        foreignField: '_id',
                        as: 'tA',
                    },
                },
                { $unwind: { path: '$tA', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'teams',
                        localField: 'teamB_id',
                        foreignField: '_id',
                        as: 'tB',
                    },
                },
                { $unwind: { path: '$tB', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'tournaments',
                        localField: 'tournamentId',
                        foreignField: '_id',
                        as: 'tour',
                    },
                },
                { $unwind: { path: '$tour', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'player_match_stats',
                        let: { mid: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$matchId', '$$mid'] },
                                            { $eq: ['$playerId', pid] },
                                        ],
                                    },
                                },
                            },
                            {
                                $project: {
                                    goals: 1,
                                    yc: 1,
                                    rc_direct: 1,
                                    rc_second_yellow: 1,
                                    pso_scored: 1,
                                    pso_missed: 1,
                                },
                            },
                        ],
                        as: 'pstat',
                    },
                },
                { $addFields: { pstat: { $first: '$pstat' } } },
                {
                    $project: {
                        _id: 0,
                        matchId: '$_id',
                        matchDate: '$matchDate',
                        stage: '$stage',
                        result_type: '$result_type',
                        score: '$score',
                        overtime_score: '$overtime_score',
                        penalty_shootout: '$penalty_shootout',
                        teamA: { _id: '$tA._id', name: '$tA.name' },
                        teamB: { _id: '$tB._id', name: '$tB.name' },
                        tournament: { _id: '$tour._id', name: '$tour.name' },
                        player: {
                            goals: { $ifNull: ['$pstat.goals', 0] },
                            yellowCards: { $ifNull: ['$pstat.yc', 0] },
                            redCards: {
                                $ifNull: [
                                    {
                                        $add: [
                                            { $ifNull: ['$pstat.rc_direct', 0] },
                                            { $ifNull: ['$pstat.rc_second_yellow', 0] },
                                        ],
                                    },
                                    0,
                                ],
                            },
                            pensScored: { $ifNull: ['$pstat.pso_scored', 0] },
                            pensMissed: { $ifNull: ['$pstat.pso_missed', 0] },
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

export const rebuildPlayerStats = async (req, res, db) => {
    try {
        const { tournamentId } = req.body || {}
        await recomputeAllPlayerStats(db, { tournamentId })
        res.json({ ok: true })
    } catch (e) {
        console.error('rebuildPlayerStats error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}
