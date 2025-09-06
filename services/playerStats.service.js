import { ObjectId } from 'mongodb'

const OVERTIME_END_MINUTE = 50

export function computePlayerMatchStats(match) {
    const byPlayer = new Map()
    const ensure = (pid, teamId) => {
        const k = String(pid)
        if (!byPlayer.has(k)) {
            byPlayer.set(k, {
                playerId: new ObjectId(pid),
                teamId: new ObjectId(teamId),
                matchId: new ObjectId(match._id),
                tournamentId: new ObjectId(match.tournamentId),
                goals: 0,
                yc: 0,
                rc_direct: 0,
                rc_second_yellow: 0,
                pso_scored: 0,
                pso_missed: 0,
            })
        }
        return byPlayer.get(k)
    }

    const events = (match?.events || []).slice().sort((a, b) => (a.minute || 0) - (b.minute || 0))
    const yellowCounts = new Map()

    for (const e of events) {
        const pid = e?.playerId
        const tid = e?.teamId
        if (!pid || !tid) continue
        const stat = ensure(pid, tid)
        const minute = Number(e.minute || 0)

        if (e.type === 'goal') {
            if (minute >= 1 && minute <= OVERTIME_END_MINUTE) stat.goals += 1
        } else if (e.type === 'yellow-card') {
            stat.yc += 1
            const k = String(pid)
            yellowCounts.set(k, (yellowCounts.get(k) || 0) + 1)
            if (yellowCounts.get(k) === 2) stat.rc_second_yellow = 1
        } else if (e.type === 'red-card') {
            stat.rc_direct = 1
        }
    }

    const pso = match?.penalty_shootout?.events || []
    for (const p of pso) {
        const pid = p?.playerId
        const tid = p?.teamId
        if (!pid || !tid) continue
        const stat = ensure(pid, tid)
        if (p.outcome === 'scored') stat.pso_scored += 1
        else stat.pso_missed += 1
    }

    return [...byPlayer.values()].filter(
        (s) => s.goals || s.yc || s.rc_direct || s.rc_second_yellow || s.pso_scored || s.pso_missed
    )
}

export async function upsertPlayerMatchStats(db, match) {
    const col = db.collection('player_match_stats')

    await col.createIndex({ matchId: 1, playerId: 1 }, { unique: true })
    await col.createIndex({ playerId: 1, tournamentId: 1 })

    if (match.status !== 'finished') {
        await col.deleteMany({ matchId: new ObjectId(match._id) })
        return
    }

    const docs = computePlayerMatchStats(match)
    const now = new Date()

    if (docs.length === 0) {
        await col.deleteMany({ matchId: new ObjectId(match._id) })
        return
    }

    const playerIds = docs.map((d) => d.playerId)
    const ops = docs.map((d) => ({
        updateOne: {
            filter: { matchId: d.matchId, playerId: d.playerId },
            update: {
                $set: {
                    tournamentId: d.tournamentId,
                    teamId: d.teamId,
                    goals: d.goals,
                    yc: d.yc,
                    rc_direct: d.rc_direct,
                    rc_second_yellow: d.rc_second_yellow,
                    pso_scored: d.pso_scored,
                    pso_missed: d.pso_missed,
                    updatedAt: now,
                },
                $setOnInsert: { createdAt: now },
            },
            upsert: true,
        },
    }))

    await col.bulkWrite(ops, { ordered: false })

    await col.deleteMany({
        matchId: new ObjectId(match._id),
        playerId: { $nin: playerIds },
    })
}

export async function recomputeAllPlayerStats(db, { tournamentId } = {}) {
    const filter = { status: 'finished' }
    if (tournamentId && ObjectId.isValid(tournamentId)) {
        filter.tournamentId = new ObjectId(tournamentId)
    }

    const cursor = db.collection('matches').find(filter, { projection: { _id: 1 } })
    for await (const m of cursor) {
        const full = await db.collection('matches').findOne({ _id: m._id })
        if (full) {
            await upsertPlayerMatchStats(db, full)
        }
    }
}
