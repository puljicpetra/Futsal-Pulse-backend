import { ObjectId } from 'mongodb'
import { validationResult } from 'express-validator'

const HEX24 = /[a-fA-F0-9]{24}/

const toOid = (v) => {
    if (!v) return null
    if (v instanceof ObjectId) return v
    if (typeof v === 'object' && typeof v.$oid === 'string' && ObjectId.isValid(v.$oid)) {
        return new ObjectId(v.$oid)
    }
    if (typeof v === 'string') {
        const m = v.match(HEX24)
        if (m && ObjectId.isValid(m[0])) return new ObjectId(m[0])
    }
    return null
}

const idStr = (v) =>
    v instanceof ObjectId ? v.toString() : typeof v === 'string' ? v : v?.toString?.() || ''

const COLL_ANN = 'tournament_announcements'
const COLL_SUBS = 'tournament_subscriptions'

async function ensureIndexes(db) {
    await db.collection(COLL_SUBS).createIndex({ tournamentId: 1, userId: 1 }, { unique: true })
    await db.collection(COLL_ANN).createIndex({ tournamentId: 1, createdAt: -1 })
}

async function isOrganizer(db, tournamentId, userId) {
    const t = await db.collection('tournaments').findOne({ _id: tournamentId })
    if (!t) return { ok: false, error: 'Tournament not found.' }

    const org = t.organizer?._id || t.organizer || t.organizerInfo?._id
    const same = org && idStr(org) === idStr(userId)
    return { ok: true, tournament: t, isOrg: !!same }
}

async function getApprovedTeamIdsForTournament(db, tournamentId) {
    const tId = toOid(tournamentId)
    const regs = await db
        .collection('registrations')
        .find({
            $or: [{ tournamentId: tId }, { tournament_id: tId }],
            status: 'approved',
        })
        .project({ teamId: 1, team_id: 1, team: 1 })
        .toArray()

    const ids = new Set()
    for (const r of regs) {
        const options = [toOid(r.teamId), toOid(r.team_id), toOid(r.team?._id)].filter(Boolean)
        for (const x of options) ids.add(idStr(x))
    }
    return new Set([...ids].map((s) => new ObjectId(s)))
}

async function isRegisteredCaptain(db, tournamentId, userId) {
    const teamIds = await getApprovedTeamIdsForTournament(db, tournamentId)
    if (!teamIds.size) return false

    const teams = await db
        .collection('teams')
        .find({ _id: { $in: [...teamIds] } })
        .project({ captain: 1, captain_id: 1 })
        .toArray()

    const u = idStr(userId)
    return teams.some((t) => [t.captain, t.captain_id].some((x) => idStr(x) === u))
}

export async function getSubscription(req, res, db) {
    try {
        await ensureIndexes(db)
        const tid = toOid(req.params.id)
        if (!tid) return res.status(400).json({ message: 'Invalid tournament ID.' })
        const uid = toOid(req.user?.id)
        if (!uid) return res.status(401).json({ message: 'Unauthorized.' })

        const sub = await db.collection(COLL_SUBS).findOne({ tournamentId: tid, userId: uid })
        res.json({ subscribed: !!sub })
    } catch (e) {
        console.error('getSubscription error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}

export async function subscribe(req, res, db) {
    try {
        await ensureIndexes(db)
        const tid = toOid(req.params.id)
        if (!tid) return res.status(400).json({ message: 'Invalid tournament ID.' })
        const uid = toOid(req.user?.id)
        if (!uid) return res.status(401).json({ message: 'Unauthorized.' })

        const me = await db.collection('users').findOne({ _id: uid }, { projection: { role: 1 } })
        if (!me) return res.status(404).json({ message: 'User not found.' })

        if (!['fan', 'player'].includes(me.role)) {
            return res
                .status(403)
                .json({ message: 'Only fans or players can subscribe to tournament updates.' })
        }

        await db
            .collection(COLL_SUBS)
            .updateOne(
                { tournamentId: tid, userId: uid },
                { $setOnInsert: { tournamentId: tid, userId: uid, createdAt: new Date() } },
                { upsert: true }
            )
        res.json({ message: 'Subscribed to tournament updates.' })
    } catch (e) {
        if (e?.code === 11000) return res.json({ message: 'Already subscribed.' })
        console.error('subscribe error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}

export async function unsubscribe(req, res, db) {
    try {
        await ensureIndexes(db)
        const tid = toOid(req.params.id)
        if (!tid) return res.status(400).json({ message: 'Invalid tournament ID.' })
        const uid = toOid(req.user?.id)
        if (!uid) return res.status(401).json({ message: 'Unauthorized.' })

        await db.collection(COLL_SUBS).deleteOne({ tournamentId: tid, userId: uid })
        res.json({ message: 'Unsubscribed.' })
    } catch (e) {
        console.error('unsubscribe error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}

export async function listAnnouncements(req, res, db) {
    try {
        await ensureIndexes(db)
        const tid = toOid(req.params.id)
        if (!tid) return res.status(400).json({ message: 'Invalid tournament ID.' })
        const uid = toOid(req.user?.id)
        if (!uid) return res.status(401).json({ message: 'Unauthorized.' })

        const orgCheck = await isOrganizer(db, tid, uid)
        if (!orgCheck.ok) return res.status(404).json({ message: orgCheck.error })

        const isOrg = orgCheck.isOrg
        const isSub = !!(await db.collection(COLL_SUBS).findOne({ tournamentId: tid, userId: uid }))
        const isCaptain = await isRegisteredCaptain(db, tid, uid)

        if (!isOrg && !isSub && !isCaptain) {
            return res.status(403).json({ message: 'Not allowed to view announcements.' })
        }

        const list = await db
            .collection(COLL_ANN)
            .find({ tournamentId: tid })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray()

        res.json(list)
    } catch (e) {
        console.error('listAnnouncements error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}

export async function createAnnouncement(req, res, db) {
    const result = validationResult(req)
    if (!result.isEmpty()) {
        return res.status(400).json({ message: 'Invalid payload.', errors: result.array() })
    }

    try {
        await ensureIndexes(db)
        const tid = toOid(req.params.id)
        if (!tid) return res.status(400).json({ message: 'Invalid tournament ID.' })
        const uid = toOid(req.user?.id)
        if (!uid) return res.status(401).json({ message: 'Unauthorized.' })

        const orgCheck = await isOrganizer(db, tid, uid)
        if (!orgCheck.ok) return res.status(404).json({ message: orgCheck.error })
        if (!orgCheck.isOrg)
            return res.status(403).json({ message: 'Only the organizer can post announcements.' })

        const { title = '', text } = req.body
        const ann = {
            tournamentId: tid,
            organizerId: uid,
            title: String(title || '').slice(0, 160),
            text: String(text || '').slice(0, 4000),
            createdAt: new Date(),
        }
        const ins = await db.collection(COLL_ANN).insertOne(ann)
        ann._id = ins.insertedId

        const teamIds = await getApprovedTeamIdsForTournament(db, tid)

        let captainIds = []
        if (teamIds.size) {
            const teams = await db
                .collection('teams')
                .find({ _id: { $in: [...teamIds] } })
                .project({ captain: 1, captain_id: 1 })
                .toArray()
            captainIds = teams.map((t) => idStr(t.captain) || idStr(t.captain_id)).filter(Boolean)
        }

        const subs = await db
            .collection(COLL_SUBS)
            .find({ tournamentId: tid })
            .project({ userId: 1 })
            .toArray()
        const subUserIds = subs.map((s) => idStr(s.userId)).filter(Boolean)

        const recipients = new Set(
            [...captainIds, ...subUserIds].filter((s) => !!s && s !== idStr(uid))
        )

        const tournament = orgCheck.tournament
        const short = ann.title || (ann.text.length > 80 ? ann.text.slice(0, 77) + '…' : ann.text)

        const notifOps = Array.from(recipients).map((sid) => ({
            insertOne: {
                document: {
                    userId: new ObjectId(sid),
                    message: `Announcement in "${tournament.name}": ${short}`,
                    type: 'tournament_announcement',
                    isRead: false,
                    createdAt: new Date(),
                    link: `/tournaments/${idStr(tid)}`,
                    data: {
                        tournamentId: tid,
                        tournamentName: tournament.name,
                        announcementId: ann._id,
                        title: ann.title,
                    },
                },
            },
        }))

        if (notifOps.length) {
            await db.collection('notifications').bulkWrite(notifOps, { ordered: false })
        }

        res.status(201).json({ message: 'Announcement posted.', announcement: ann })
    } catch (e) {
        console.error('createAnnouncement error:', e)
        res.status(500).json({ message: 'Server error.' })
    }
}
