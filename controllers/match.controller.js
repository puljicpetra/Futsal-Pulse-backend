import { ObjectId } from 'mongodb'
import { body, validationResult } from 'express-validator'
import { upsertPlayerMatchStats } from '../services/playerStats.service.js'

const MAX_REGULAR_MINUTE = 40
const OVERTIME_START_MINUTE = MAX_REGULAR_MINUTE + 1
const OVERTIME_END_MINUTE = 50
const MAX_PENALTY_SERIES = 5

const oidLikeToString = (v) => {
    if (!v) return null
    if (typeof v === 'string') return v
    if (typeof v === 'object' && typeof v.$oid === 'string') return v.$oid
    return null
}
const toObjectId = (v) => {
    const s = oidLikeToString(v)
    return s && ObjectId.isValid(s) ? new ObjectId(s) : null
}
const mongoIdOrEjson = (field) =>
    body(field).custom((v) => {
        const s = oidLikeToString(v)
        if (!s || !ObjectId.isValid(s)) {
            throw new Error('Valid Mongo ID is required.')
        }
        return true
    })

const STAGES = ['round_of_16', 'quarter', 'semi', 'third_place', 'final']
const LABELS = {
    round_of_16: 'Round of 16',
    quarter: 'Quarter-final',
    semi: 'Semi-final',
    third_place: 'Third place',
    final: 'Final',
}
const MAX_MATCHES = { round_of_16: 8, quarter: 4, semi: 2, final: 1, third_place: 1 }

function startingStageFor(teamCount) {
    if (teamCount === 2) return 'final'
    if (teamCount === 4) return 'semi'
    if (teamCount === 8) return 'quarter'
    if (teamCount === 16) return 'round_of_16'
    return null
}
function previousStage(stage) {
    if (stage === 'final' || stage === 'third_place') return 'semi'
    if (stage === 'semi') return 'quarter'
    if (stage === 'quarter') return 'round_of_16'
    return null
}
function isSamePair(a1, b1, a2, b2) {
    const x1 = String(a1)
    const y1 = String(b1)
    const x2 = String(a2)
    const y2 = String(b2)
    return (x1 === x2 && y1 === y2) || (x1 === y2 && y1 === x2)
}

function regTotals(m) {
    return {
        A: m?.score?.teamA ?? 0,
        B: m?.score?.teamB ?? 0,
    }
}
function otTotals(m) {
    return {
        A: m?.overtime_score?.teamA ?? 0,
        B: m?.overtime_score?.teamB ?? 0,
    }
}
function tiedAfterRegular(m) {
    const r = regTotals(m)
    return r.A === r.B
}
function tiedAfterOvertime(m) {
    const r = regTotals(m)
    const o = otTotals(m)
    return r.A + o.A === r.B + o.B
}

function penaltyShotsForTeam(match, teamId) {
    const events = match.penalty_shootout?.events || []
    return events.filter((e) => e.teamId?.equals?.(teamId)).length
}
function penaltyKicksByPlayer(match, teamId, teamPlayers) {
    const ids = (teamPlayers || []).map((p) => String(p))
    const counts = new Map(ids.map((id) => [id, 0]))
    const events = match.penalty_shootout?.events || []
    for (const e of events) {
        if (e.teamId?.equals?.(teamId)) {
            const pid = String(e.playerId)
            counts.set(pid, (counts.get(pid) || 0) + 1)
        }
    }
    return counts
}
function canPlayerShootNow(countsMap, playerId) {
    const all = [...countsMap.values()]
    if (all.length === 0) return true
    const minCount = Math.min(...all)
    const thisCount = countsMap.get(String(playerId)) || 0
    return thisCount === minCount
}
function computePenaltyDecision(match, maxSeries = 5) {
    const ps = match.penalty_shootout
    if (!ps) return { decided: false }

    const shotsA = penaltyShotsForTeam(match, match.teamA_id)
    const shotsB = penaltyShotsForTeam(match, match.teamB_id)
    const goalsA = ps.teamA_goals ?? 0
    const goalsB = ps.teamB_goals ?? 0

    if (shotsA <= maxSeries && shotsB <= maxSeries) {
        const remainingA = maxSeries - shotsA
        const remainingB = maxSeries - shotsB
        if (goalsA - goalsB > remainingB) {
            return { decided: true, winner: match.teamA_id, phase: 'series' }
        }
        if (goalsB - goalsA > remainingA) {
            return { decided: true, winner: match.teamB_id, phase: 'series' }
        }
    }

    if (shotsA >= maxSeries && shotsB >= maxSeries) {
        if (shotsA === shotsB && goalsA !== goalsB) {
            return {
                decided: true,
                winner: goalsA > goalsB ? match.teamA_id : match.teamB_id,
                phase: 'sudden_death',
            }
        }
    }

    return { decided: false }
}

function wasDismissedByMinute(match, playerId, cutoffMinute, inclusive = true) {
    const pid = String(playerId)
    let yellows = 0
    for (const e of match.events || []) {
        if (String(e.playerId) !== pid) continue
        const m = e.minute ?? 0
        if (inclusive ? m <= cutoffMinute : m < cutoffMinute) {
            if (e.type === 'red-card') return true
            if (e.type === 'yellow-card') {
                yellows += 1
                if (yellows >= 2) return true
            }
        }
    }
    return false
}

async function syncPlayerStatsIfFinished(db, matchId) {
    const raw = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
    if (raw) {
        await upsertPlayerMatchStats(db, raw)
    }
}

export const createMatchValidationRules = () => [
    body('tournamentId').isMongoId().withMessage('Valid tournament ID is required.'),
    mongoIdOrEjson('teamA_id').withMessage('Valid Team A ID is required.'),
    mongoIdOrEjson('teamB_id')
        .withMessage('Valid Team B ID is required.')
        .custom((value, { req }) => {
            const a = oidLikeToString(req.body.teamA_id)
            const b = oidLikeToString(value)
            if (a && b && a === b) {
                throw new Error('Team A and Team B cannot be the same team.')
            }
            return true
        }),
    body('matchDate').isISO8601().toDate().withMessage('Valid match date is required.'),
    body('group').optional().trim().isString(),
    body('stage').isIn(STAGES).withMessage('Invalid stage.'),
]

export const addEventValidationRules = () => [
    body('type').isIn(['goal', 'yellow-card', 'red-card']).withMessage('Event type is invalid.'),
    body('minute').isInt({ min: 1 }).withMessage('Minute must be a positive number.'),
    mongoIdOrEjson('teamId').withMessage('Valid team ID is required.'),
    mongoIdOrEjson('playerId').withMessage('Valid player ID is required.'),
]

export const addPenaltyEventValidationRules = () => [
    mongoIdOrEjson('teamId').withMessage('Valid team ID is required.'),
    mongoIdOrEjson('playerId').withMessage('Valid player ID is required.'),
    body('outcome').isIn(['scored', 'missed']).withMessage('Outcome is invalid.'),
]

async function isPlayerInTeam(db, teamId, playerId) {
    const team = await db
        .collection('teams')
        .findOne({ _id: teamId }, { projection: { captain: 1, players: 1 } })
    if (!team) return false
    if (team.captain?.equals?.(playerId)) return true
    return Array.isArray(team.players) && team.players.some((p) => p?.equals?.(playerId))
}

async function getApprovedTeamIds(db, tournamentId) {
    const regs = await db
        .collection('registrations')
        .find({ tournamentId: new ObjectId(tournamentId), status: 'approved' })
        .project({ teamId: 1 })
        .toArray()
    return regs.map((r) => r.teamId)
}
async function getMatchesByStage(db, tournamentId, stage) {
    return db
        .collection('matches')
        .find({ tournamentId: new ObjectId(tournamentId), stage })
        .toArray()
}
function getWinnerLoserFromMatch(m) {
    const r = regTotals(m)
    const o = otTotals(m)
    const penA = m.penalty_shootout?.teamA_goals ?? 0
    const penB = m.penalty_shootout?.teamB_goals ?? 0
    const totalA = r.A + o.A + penA
    const totalB = r.B + o.B + penB
    if (totalA === totalB) return null
    return {
        winner: totalA > totalB ? m.teamA_id : m.teamB_id,
        loser: totalA > totalB ? m.teamB_id : m.teamA_id,
    }
}
async function getSemiWinnersLosers(db, tournamentId) {
    const semis = await db
        .collection('matches')
        .find({
            tournamentId: new ObjectId(tournamentId),
            stage: 'semi',
            status: 'finished',
        })
        .toArray()

    const winners = []
    const losers = []
    for (const m of semis) {
        const wl = getWinnerLoserFromMatch(m)
        if (wl) {
            winners.push(wl.winner)
            losers.push(wl.loser)
        }
    }
    return { winners, losers }
}

function buildMatchDetailsPipeline(matchFilter) {
    return [
        { $match: matchFilter },
        { $lookup: { from: 'teams', localField: 'teamA_id', foreignField: '_id', as: 'teamA' } },
        { $unwind: { path: '$teamA', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'teams', localField: 'teamB_id', foreignField: '_id', as: 'teamB' } },
        { $unwind: { path: '$teamB', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'users',
                localField: 'teamA.players',
                foreignField: '_id',
                as: 'teamAPlayers',
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'teamB.players',
                foreignField: '_id',
                as: 'teamBPlayers',
            },
        },
        {
            $project: {
                _id: 1,
                tournamentId: 1,
                matchDate: 1,
                status: 1,
                result_type: 1,
                group: 1,
                stage: 1,
                events: 1,
                score: 1,
                overtime_score: 1,
                penalty_shootout: 1,
                teamA: {
                    _id: '$teamA._id',
                    name: '$teamA.name',
                    players: {
                        $map: {
                            input: '$teamAPlayers',
                            as: 'p',
                            in: { _id: '$$p._id', name: '$$p.full_name' },
                        },
                    },
                },
                teamB: {
                    _id: '$teamB._id',
                    name: '$teamB.name',
                    players: {
                        $map: {
                            input: '$teamBPlayers',
                            as: 'p',
                            in: { _id: '$$p._id', name: '$$p.full_name' },
                        },
                    },
                },
            },
        },
    ]
}

export const createMatch = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        const msg = errors
            .array()
            .map((e) => `${e.param}: ${e.msg}`)
            .join(' | ')
        console.error('[createMatch] validation errors:', msg, ' body:', req.body)
        return res.status(400).json({ message: msg, errors: errors.array() })
    }

    const { tournamentId, teamA_id, teamB_id, matchDate, group, stage } = req.body
    const organizerId = new ObjectId(req.user.id)

    console.log('[createMatch] body:', req.body)

    try {
        const tournament = await db
            .collection('tournaments')
            .findOne({ _id: new ObjectId(tournamentId) })
        if (!tournament) return res.status(404).json({ message: 'Tournament not found.' })
        if (!tournament.organizer?.equals?.(organizerId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the tournament organizer can add matches.' })
        }

        const matchDateObj = new Date(matchDate)
        if (isNaN(matchDateObj.getTime())) {
            console.error('[createMatch] invalid matchDate:', matchDate)
            return res.status(400).json({ message: 'Invalid match date.' })
        }

        const d = (x) => new Date(x).toISOString().slice(0, 10)
        const startDay = d(tournament.startDate)
        const endDay = d(tournament.endDate || tournament.startDate)
        const matchDay = d(matchDateObj)
        console.log('[createMatch] dayRange:', { startDay, endDay, matchDay })
        if (matchDay < startDay || matchDay > endDay) {
            return res.status(400).json({
                message: `Match date must be within tournament dates (${startDay} – ${endDay}).`,
            })
        }

        const tA = toObjectId(teamA_id)
        const tB = toObjectId(teamB_id)
        if (!tA || !tB) {
            console.error('[createMatch] team id parse failed:', { teamA_id, teamB_id })
            return res.status(400).json({ message: 'Invalid team IDs.' })
        }

        const approvedTeamIds = await getApprovedTeamIds(db, tournamentId)
        console.log('[createMatch] approved teams:', approvedTeamIds.map(String))
        const N = approvedTeamIds.length
        const startStage = startingStageFor(N)
        console.log('[createMatch] N/startStage/stage:', N, startStage, stage)
        if (!startStage) {
            return res
                .status(422)
                .json({ message: 'Bracket sizes other than 2, 4, 8, 16 are not supported yet.' })
        }

        const allowedNow = await (async () => {
            const isStart = stage === startStage
            if (isStart) {
                const existingStart = (await getMatchesByStage(db, tournamentId, startStage)).length
                console.log('[createMatch] existing start stage count:', existingStart)
                if (existingStart >= MAX_MATCHES[startStage])
                    return { ok: false, reason: 'Stage is already full.' }
                return { ok: true }
            }
            const prev = previousStage(stage)
            if (!prev) return { ok: false, reason: 'Invalid progression.' }

            const prevMatches = await getMatchesByStage(db, tournamentId, prev)
            const prevFinished = prevMatches.filter((m) => m.status === 'finished').length
            const needFinished = MAX_MATCHES[prev]
            console.log('[createMatch] prev stage status:', { prev, prevFinished, needFinished })
            if (prevFinished !== needFinished) {
                return {
                    ok: false,
                    reason: `Available after ${prev} are finished (${prevFinished}/${needFinished}).`,
                }
            }

            const existing = (await getMatchesByStage(db, tournamentId, stage)).length
            console.log('[createMatch] existing current stage count:', existing)
            if (existing >= MAX_MATCHES[stage])
                return { ok: false, reason: 'Stage is already full.' }
            return { ok: true }
        })()

        if (!allowedNow.ok) {
            console.error('[createMatch] stage not allowed:', allowedNow.reason)
            return res.status(400).json({ message: allowedNow.reason })
        }

        const approvedSet = new Set(approvedTeamIds.map((x) => String(x)))
        if (!approvedSet.has(String(tA)) || !approvedSet.has(String(tB))) {
            console.error('[createMatch] team not approved:', { tA: String(tA), tB: String(tB) })
            return res
                .status(400)
                .json({ message: 'Both teams must be approved for this tournament.' })
        }

        const stageMatches = await getMatchesByStage(db, tournamentId, stage)
        for (const m of stageMatches) {
            const usedIds = [String(m.teamA_id), String(m.teamB_id)]
            if (usedIds.includes(String(tA)) || usedIds.includes(String(tB))) {
                console.error('[createMatch] team already used in stage:', {
                    usedIds,
                    tA: String(tA),
                    tB: String(tB),
                })
                return res
                    .status(400)
                    .json({ message: 'A team cannot play more than once in the same stage.' })
            }
            if (isSamePair(m.teamA_id, m.teamB_id, tA, tB)) {
                console.error('[createMatch] duplicate pairing in stage')
                return res
                    .status(400)
                    .json({ message: 'This pairing already exists in this stage.' })
            }
        }

        if (stage === 'final' || stage === 'third_place') {
            const { winners, losers } = await getSemiWinnersLosers(db, tournamentId)
            const pool = stage === 'final' ? winners : losers
            const poolSet = new Set(pool.map((x) => String(x)))
            if (!poolSet.has(String(tA)) || !poolSet.has(String(tB))) {
                console.error('[createMatch] team not eligible for final/third:', {
                    tA: String(tA),
                    tB: String(tB),
                    pool: Array.from(poolSet),
                })
                return res.status(400).json({
                    message: `Selected teams are not eligible for ${stage.replace('_', ' ')}.`,
                })
            }
        }

        const newMatch = {
            tournamentId: new ObjectId(tournamentId),
            teamA_id: tA,
            teamB_id: tB,
            score: { teamA: 0, teamB: 0 },
            overtime_score: null,
            penalty_shootout: null,
            matchDate: matchDateObj,
            status: 'scheduled',
            result_type: 'regular',
            stage,
            group: group || null,
            events: [],
            createdAt: new Date(),
        }

        const result = await db.collection('matches').insertOne(newMatch)
        const createdMatch = await db.collection('matches').findOne({ _id: result.insertedId })
        console.log('[createMatch] OK created match:', String(result.insertedId))
        res.status(201).json({ message: 'Match created successfully', match: createdMatch })
    } catch (error) {
        console.error('Error creating match:', error)
        res.status(500).json({ message: 'Server error while creating match.' })
    }
}

export const getAllMatches = async (req, res, db) => {
    const { tournamentId, teamId } = req.query

    try {
        const filter = {}
        if (tournamentId && ObjectId.isValid(tournamentId)) {
            filter.tournamentId = new ObjectId(tournamentId)
        }
        if (teamId && ObjectId.isValid(teamId)) {
            filter.$or = [{ teamA_id: new ObjectId(teamId) }, { teamB_id: new ObjectId(teamId) }]
        }

        const pipeline = [
            { $match: filter },
            { $sort: { matchDate: -1 } },
            {
                $lookup: {
                    from: 'tournaments',
                    localField: 'tournamentId',
                    foreignField: '_id',
                    as: 'tournamentDetails',
                },
            },
            { $unwind: { path: '$tournamentDetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamA_id',
                    foreignField: '_id',
                    as: 'teamADetails',
                },
            },
            { $unwind: { path: '$teamADetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'teamB_id',
                    foreignField: '_id',
                    as: 'teamBDetails',
                },
            },
            { $unwind: { path: '$teamBDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    score: 1,
                    overtime_score: 1,
                    penalty_shootout: 1,
                    matchDate: 1,
                    status: 1,
                    result_type: 1,
                    group: 1,
                    stage: 1,
                    tournament: { _id: '$tournamentDetails._id', name: '$tournamentDetails.name' },
                    teamA: { _id: '$teamADetails._id', name: '$teamADetails.name' },
                    teamB: { _id: '$teamBDetails._id', name: '$teamBDetails.name' },
                },
            },
        ]
        const matches = await db.collection('matches').aggregate(pipeline).toArray()
        res.status(200).json(matches)
    } catch (error) {
        console.error('Error fetching all matches:', error)
        res.status(500).json({ message: 'Server error while fetching matches.' })
    }
}

export const getMatchesForTournament = async (req, res, db) => {
    const { tournamentId } = req.params
    const { limit } = req.query

    if (!ObjectId.isValid(tournamentId)) {
        return res.status(400).json({ message: 'Invalid tournament ID.' })
    }

    try {
        const pipeline = [
            ...buildMatchDetailsPipeline({ tournamentId: new ObjectId(tournamentId) }),
            { $sort: { matchDate: 1 } },
        ]

        const limitNum = parseInt(limit, 10)
        if (!isNaN(limitNum) && limitNum > 0) {
            pipeline.push({ $limit: limitNum })
        }

        const matches = await db.collection('matches').aggregate(pipeline).toArray()
        res.status(200).json(matches)
    } catch (error) {
        console.error('Error fetching matches for tournament:', error)
        res.status(500).json({ message: 'Server error while fetching matches.' })
    }
}

export const getMatchById = async (req, res, db) => {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid match ID.' })
    }

    try {
        const pipeline = buildMatchDetailsPipeline({ _id: new ObjectId(id) })
        const matches = await db.collection('matches').aggregate(pipeline).toArray()

        if (matches.length === 0) {
            return res.status(404).json({ message: 'Match not found.' })
        }

        res.status(200).json(matches[0])
    } catch (error) {
        console.error('Error fetching match by ID:', error)
        res.status(500).json({ message: 'Server error while fetching match.' })
    }
}

export const finishMatch = async (req, res, db) => {
    const { matchId } = req.params
    const requesterId = new ObjectId(req.user.id)
    if (!ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Invalid match ID.' })
    }
    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' })
        }
        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId })
        if (!tournament || !tournament.organizer.equals(requesterId)) {
            return res.status(403).json({
                message: 'Forbidden: Only the tournament organizer can perform this action.',
            })
        }
        if (match.status === 'finished') {
            return res
                .status(400)
                .json({ message: 'This match has already been marked as finished.' })
        }

        if (match.result_type === 'regular' && tiedAfterRegular(match)) {
            return res.status(400).json({
                message: 'Match is tied after regular time. Proceed to overtime/penalties.',
            })
        }
        if (match.result_type === 'overtime' && tiedAfterOvertime(match)) {
            return res.status(400).json({
                message: 'Match is tied after overtime. Proceed to penalties.',
            })
        }
        if (match.result_type === 'penalties') {
            const decision = computePenaltyDecision(match, MAX_PENALTY_SERIES)
            if (!decision.decided && !match.penalty_shootout?.decided) {
                return res.status(400).json({ message: 'Penalty shootout not decided yet.' })
            }
        }

        await db
            .collection('matches')
            .updateOne({ _id: new ObjectId(matchId) }, { $set: { status: 'finished' } })

        await syncPlayerStatsIfFinished(db, matchId)

        const [detailed] = await db
            .collection('matches')
            .aggregate(buildMatchDetailsPipeline({ _id: new ObjectId(matchId) }))
            .toArray()

        res.status(200).json({ message: 'Match marked as finished.', match: detailed })
    } catch (error) {
        console.error('Error finishing match:', error)
        res.status(500).json({ message: 'Server error while finishing match.' })
    }
}

export const deleteMatch = async (req, res, db) => {
    const { matchId } = req.params
    const organizerId = new ObjectId(req.user.id)
    if (!ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Invalid match ID.' })
    }
    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' })
        }
        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId })
        if (!tournament || !tournament.organizer.equals(organizerId)) {
            return res
                .status(403)
                .json({ message: 'Forbidden: Only the tournament organizer can delete matches.' })
        }
        await db.collection('matches').deleteOne({ _id: new ObjectId(matchId) })
        res.status(200).json({ message: 'Match deleted successfully.' })
    } catch (error) {
        console.error('Error deleting match:', error)
        res.status(500).json({ message: 'Server error while deleting match.' })
    }
}

export const addMatchEvent = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        const msg = errors
            .array()
            .map((e) => `${e.param}: ${e.msg}`)
            .join(' | ')
        return res.status(400).json({ message: msg, errors: errors.array() })
    }

    const { matchId } = req.params
    if (!ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Invalid match ID.' })
    }

    const { type, minute, teamId, playerId } = req.body
    const requesterId = new ObjectId(req.user.id)

    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
        if (!match) return res.status(404).json({ message: 'Match not found.' })

        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId })
        if (!tournament || !tournament.organizer.equals(requesterId)) {
            return res.status(403).json({ message: 'Forbidden: You are not the organizer.' })
        }

        const teamObjId = toObjectId(teamId)
        if (
            !teamObjId ||
            (!match.teamA_id.equals(teamObjId) && !match.teamB_id.equals(teamObjId))
        ) {
            return res
                .status(400)
                .json({ message: 'Provided teamId does not belong to this match.' })
        }
        const teamIdentifier = match.teamA_id.equals(teamObjId) ? 'A' : 'B'

        const playerObjId = toObjectId(playerId)
        if (!playerObjId) return res.status(400).json({ message: 'Invalid player ID.' })
        const member = await isPlayerInTeam(db, teamObjId, playerObjId)
        if (!member) {
            return res
                .status(400)
                .json({ message: 'Provided playerId does not belong to the selected team.' })
        }

        const minuteInt = parseInt(minute, 10)
        if (Number.isNaN(minuteInt) || minuteInt < 1) {
            return res.status(400).json({ message: 'Minute must be a positive number.' })
        }
        if (minuteInt > OVERTIME_END_MINUTE) {
            return res.status(400).json({
                message: `Overtime is limited to ${OVERTIME_START_MINUTE}–${OVERTIME_END_MINUTE} minutes in futsal.`,
            })
        }

        const isFinished = match.status === 'finished'

        if (!isFinished && minuteInt > MAX_REGULAR_MINUTE && !tiedAfterRegular(match)) {
            return res.status(400).json({
                message: 'Extra-time events are allowed only if regular time ended in a draw.',
            })
        }

        if (!isFinished) {
            const sentOffBeforeThis = wasDismissedByMinute(match, playerObjId, minuteInt, false)
            if (sentOffBeforeThis) {
                return res.status(400).json({
                    message: 'Player is already sent off and cannot record further events.',
                })
            }
        }

        const newEvent = {
            _id: new ObjectId(),
            type,
            minute: minuteInt,
            teamId: teamObjId,
            playerId: playerObjId,
            createdAt: new Date(),
        }

        let updateOperation = { $push: { events: newEvent } }

        if (type === 'goal') {
            if (minuteInt > MAX_REGULAR_MINUTE) {
                if (!match.overtime_score) {
                    await db.collection('matches').updateOne(
                        { _id: new ObjectId(matchId) },
                        {
                            $set: {
                                overtime_score: { teamA: 0, teamB: 0 },
                                result_type: 'overtime',
                            },
                        }
                    )
                    match.overtime_score = { teamA: 0, teamB: 0 }
                    match.result_type = 'overtime'
                }
                const scoreField = `overtime_score.team${teamIdentifier}`
                updateOperation = { ...updateOperation, $inc: { [scoreField]: 1 } }
            } else {
                const scoreField = `score.team${teamIdentifier}`
                updateOperation = { ...updateOperation, $inc: { [scoreField]: 1 } }
            }
        }

        await db.collection('matches').updateOne({ _id: new ObjectId(matchId) }, updateOperation)

        const [finalMatch] = await db
            .collection('matches')
            .aggregate(buildMatchDetailsPipeline({ _id: new ObjectId(matchId) }))
            .toArray()

        if (finalMatch?.status === 'finished') {
            await syncPlayerStatsIfFinished(db, matchId)
        }

        res.status(200).json({ message: 'Event added successfully.', match: finalMatch })
    } catch (error) {
        console.error('Error adding match event:', error)
        res.status(500).json({ message: 'Server error while adding event.' })
    }
}

export const deleteMatchEvent = async (req, res, db) => {
    const { matchId, eventId } = req.params
    const requesterId = new ObjectId(req.user.id)

    if (!ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Invalid match ID.' })
    }
    if (!ObjectId.isValid(eventId)) {
        return res.status(400).json({ message: 'Invalid event ID.' })
    }

    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
        if (!match) return res.status(404).json({ message: 'Match not found.' })

        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId })
        if (!tournament || !tournament.organizer.equals(requesterId)) {
            return res.status(403).json({ message: 'Forbidden: You are not the organizer.' })
        }

        const eventObjId = new ObjectId(eventId)
        const eventToDelete = match.events.find((e) => e._id.equals(eventObjId))
        if (!eventToDelete) return res.status(404).json({ message: 'Event not found.' })

        const updateOperation = { $pull: { events: { _id: eventObjId } } }

        if (eventToDelete.type === 'goal') {
            const minuteInt = eventToDelete.minute
            const teamIdentifier = match.teamA_id.equals(eventToDelete.teamId) ? 'A' : 'B'

            if (minuteInt > MAX_REGULAR_MINUTE) {
                const scoreField = `overtime_score.team${teamIdentifier}`
                updateOperation.$inc = { [scoreField]: -1 }
            } else {
                const scoreField = `score.team${teamIdentifier}`
                updateOperation.$inc = { [scoreField]: -1 }
            }
        }

        await db.collection('matches').updateOne({ _id: new ObjectId(matchId) }, updateOperation)

        const [finalMatch] = await db
            .collection('matches')
            .aggregate(buildMatchDetailsPipeline({ _id: new ObjectId(matchId) }))
            .toArray()

        if (finalMatch?.status === 'finished') {
            await syncPlayerStatsIfFinished(db, matchId)
        }

        res.status(200).json({ message: 'Event removed successfully.', match: finalMatch })
    } catch (error) {
        console.error('Error deleting match event:', error)
        res.status(500).json({ message: 'Server error while deleting event.' })
    }
}

export const addPenaltyEvent = async (req, res, db) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        const msg = errors
            .array()
            .map((e) => `${e.param}: ${e.msg}`)
            .join(' | ')
        return res.status(400).json({ message: msg, errors: errors.array() })
    }

    const { matchId } = req.params
    if (!ObjectId.isValid(matchId)) return res.status(400).json({ message: 'Invalid match ID.' })

    const { teamId, playerId, outcome } = req.body
    const requesterId = new ObjectId(req.user.id)

    try {
        const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
        if (!match) return res.status(404).json({ message: 'Match not found.' })

        const tournament = await db.collection('tournaments').findOne({ _id: match.tournamentId })
        if (!tournament || !tournament.organizer.equals(requesterId))
            return res.status(403).json({ message: 'Forbidden: You are not the organizer.' })

        const isFinished = match.status === 'finished'

        if (!isFinished && !tiedAfterOvertime(match)) {
            return res
                .status(400)
                .json({ message: 'Penalty shootout is allowed only if it is tied after overtime.' })
        }

        const teamObjId = toObjectId(teamId)
        if (
            !teamObjId ||
            (!match.teamA_id.equals(teamObjId) && !match.teamB_id.equals(teamObjId))
        ) {
            return res
                .status(400)
                .json({ message: 'Provided teamId does not belong to this match.' })
        }
        const teamIdentifier = match.teamA_id.equals(teamObjId) ? 'A' : 'B'

        const playerObjId = toObjectId(playerId)
        if (!playerObjId) return res.status(400).json({ message: 'Invalid player ID.' })
        const member = await isPlayerInTeam(db, teamObjId, playerObjId)
        if (!member) {
            return res
                .status(400)
                .json({ message: 'Provided playerId does not belong to the selected team.' })
        }

        if (!isFinished && wasDismissedByMinute(match, playerObjId, Infinity, true)) {
            return res
                .status(400)
                .json({ message: 'Player was sent off and cannot take a penalty.' })
        }

        const teamA = await db
            .collection('teams')
            .findOne({ _id: match.teamA_id }, { projection: { players: 1 } })
        const teamB = await db
            .collection('teams')
            .findOne({ _id: match.teamB_id }, { projection: { players: 1 } })
        const rosterA = teamA?.players || []
        const rosterB = teamB?.players || []
        const roster = teamIdentifier === 'A' ? rosterA : rosterB

        if (!match.penalty_shootout) {
            await db.collection('matches').updateOne(
                { _id: new ObjectId(matchId) },
                {
                    $set: {
                        result_type: 'penalties',
                        penalty_shootout: { teamA_goals: 0, teamB_goals: 0, events: [] },
                    },
                }
            )
            match.penalty_shootout = { teamA_goals: 0, teamB_goals: 0, events: [] }
            match.result_type = 'penalties'
        }

        if (!isFinished) {
            const shotsA = penaltyShotsForTeam(match, match.teamA_id)
            const shotsB = penaltyShotsForTeam(match, match.teamB_id)
            const nextShotsA = shotsA + (teamIdentifier === 'A' ? 1 : 0)
            const nextShotsB = shotsB + (teamIdentifier === 'B' ? 1 : 0)
            if (Math.abs(nextShotsA - nextShotsB) > 1) {
                const waitFor = nextShotsA > nextShotsB ? 'Team B' : 'Team A'
                return res.status(400).json({ message: `Wait for ${waitFor} to take its kick.` })
            }

            const counts = penaltyKicksByPlayer(match, teamObjId, roster)
            if (!canPlayerShootNow(counts, playerObjId)) {
                return res.status(400).json({
                    message:
                        'Rotation rule: a player cannot take another kick until all eligible teammates have taken one.',
                })
            }
        }

        const newPenaltyEvent = {
            _id: new ObjectId(),
            playerId: playerObjId,
            teamId: teamObjId,
            outcome,
        }

        const updateOperation = {
            $push: { 'penalty_shootout.events': newPenaltyEvent },
            ...(outcome === 'scored'
                ? { $inc: { [`penalty_shootout.team${teamIdentifier}_goals`]: 1 } }
                : {}),
            $set: { result_type: 'penalties' },
        }

        await db.collection('matches').updateOne({ _id: new ObjectId(matchId) }, updateOperation)

        const rawMatch = await db.collection('matches').findOne({ _id: new ObjectId(matchId) })
        const decision = computePenaltyDecision(rawMatch, MAX_PENALTY_SERIES)

        if (decision.decided) {
            await db.collection('matches').updateOne(
                { _id: new ObjectId(matchId) },
                {
                    $set: {
                        'penalty_shootout.decided': true,
                        'penalty_shootout.winnerTeamId': decision.winner,
                        status: 'finished',
                        result_type: 'penalties',
                    },
                }
            )
            await syncPlayerStatsIfFinished(db, matchId)
        }

        const [finalMatch] = await db
            .collection('matches')
            .aggregate(buildMatchDetailsPipeline({ _id: new ObjectId(matchId) }))
            .toArray()

        if (finalMatch?.status === 'finished') {
            await syncPlayerStatsIfFinished(db, matchId)
        }

        res.status(200).json({
            message: 'Penalty event added successfully.',
            match: finalMatch,
        })
    } catch (error) {
        console.error('Error adding penalty event:', error)
        res.status(500).json({ message: 'Server error while adding penalty event.' })
    }
}

export const getAllowedStages = async (req, res, db) => {
    const { tournamentId } = req.params
    const organizerId = new ObjectId(req.user.id)

    if (!ObjectId.isValid(tournamentId)) {
        return res.status(400).json({ message: 'Invalid tournament ID.' })
    }

    try {
        const tournament = await db
            .collection('tournaments')
            .findOne({ _id: new ObjectId(tournamentId) })
        if (!tournament) return res.status(404).json({ message: 'Tournament not found.' })
        if (!tournament.organizer?.equals?.(organizerId))
            return res.status(403).json({ message: 'Forbidden.' })

        const approvedTeamIds = await getApprovedTeamIds(db, tournamentId)
        const N = approvedTeamIds.length
        const startStage = startingStageFor(N)

        if (!startStage) {
            return res.status(422).json({
                message: 'Bracket sizes other than 2, 4, 8, 16 are not supported yet.',
            })
        }

        const allowed = []
        const disallowed = []

        const existingStart = (await getMatchesByStage(db, tournamentId, startStage)).length
        if (existingStart < MAX_MATCHES[startStage]) {
            allowed.push({
                stage: startStage,
                reason: null,
                remaining: MAX_MATCHES[startStage] - existingStart,
            })
        } else {
            disallowed.push({ stage: startStage, reason: 'Stage is already full.' })
        }

        const chainByStart = {
            round_of_16: ['quarter', 'semi', 'final', 'third_place'],
            quarter: ['semi', 'final', 'third_place'],
            semi: ['final', 'third_place'],
        }
        const chain = chainByStart[startStage] || []

        for (const st of chain) {
            const prev = previousStage(st)
            const prevMatches = await getMatchesByStage(db, tournamentId, prev)
            const prevFinished = prevMatches.filter((m) => m.status === 'finished').length
            const needFinished = MAX_MATCHES[prev]

            if (prevFinished === needFinished) {
                const existing = (await getMatchesByStage(db, tournamentId, st)).length
                if (existing < MAX_MATCHES[st]) {
                    allowed.push({ stage: st, reason: null, remaining: MAX_MATCHES[st] - existing })
                } else {
                    disallowed.push({ stage: st, reason: 'Stage is already full.' })
                }
            } else {
                disallowed.push({
                    stage: st,
                    reason: `Available after ${prev} are finished (${prevFinished}/${needFinished}).`,
                })
            }
        }

        return res.json({
            teamCount: N,
            startingStage: startStage,
            allowed,
            disallowed,
            labels: LABELS,
        })
    } catch (e) {
        console.error('getAllowedStages error:', e)
        return res.status(500).json({ message: 'Server error.' })
    }
}

export const getEligibleTeamsForStage = async (req, res, db) => {
    const { tournamentId } = req.params
    const { stage } = req.query
    const organizerId = new ObjectId(req.user.id)

    if (!ObjectId.isValid(tournamentId)) {
        return res.status(400).json({ message: 'Invalid tournament ID.' })
    }
    if (!STAGES.includes(stage)) return res.status(400).json({ message: 'Invalid stage.' })

    try {
        const tournament = await db
            .collection('tournaments')
            .findOne({ _id: new ObjectId(tournamentId) })
        if (!tournament) return res.status(404).json({ message: 'Tournament not found.' })
        if (!tournament.organizer?.equals?.(organizerId))
            return res.status(403).json({ message: 'Forbidden.' })

        const approvedTeamIds = await getApprovedTeamIds(db, tournamentId)

        const stageMatches = await getMatchesByStage(db, tournamentId, stage)
        const used = new Set(stageMatches.flatMap((m) => [String(m.teamA_id), String(m.teamB_id)]))

        let eligibleTeams = approvedTeamIds.filter((id) => !used.has(String(id)))

        if (stage === 'final' || stage === 'third_place') {
            const { winners, losers } = await getSemiWinnersLosers(db, tournamentId)
            const pool = stage === 'final' ? winners : losers
            const poolSet = new Set(pool.map((id) => String(id)))
            eligibleTeams = eligibleTeams.filter((id) => poolSet.has(String(id)))
        }

        const teams = await db
            .collection('teams')
            .find({ _id: { $in: eligibleTeams } })
            .project({ _id: 1, name: 1 })
            .toArray()

        return res.json({ stage, teams })
    } catch (e) {
        console.error('getEligibleTeamsForStage error:', e)
        return res.status(500).json({ message: 'Server error.' })
    }
}
