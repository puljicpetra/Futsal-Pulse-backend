import { ObjectId } from 'mongodb'
import { body, validationResult } from 'express-validator'

const oid = (v) => {
    if (!v) return null
    try {
        return typeof v === 'string' ? new ObjectId(v) : new ObjectId(String(v))
    } catch {
        return null
    }
}

const pickUserPublic = (u) => {
    if (!u) return null
    return {
        _id: u._id,
        name: u.full_name || u.username || 'User',
        avatar: u.profile_image_url || null,
    }
}

export const createReviewValidationRules = () => [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5.'),
    body('comment').optional().isString().isLength({ max: 1000 }).withMessage('Max 1000 chars.'),
]

async function recalcTournamentRating(db, tournamentId) {
    const tId = oid(tournamentId)
    const [agg] = await db
        .collection('reviews')
        .aggregate([
            { $match: { tournament_id: tId } },
            { $group: { _id: '$tournament_id', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
        ])
        .toArray()

    const review_count = agg?.count ?? 0
    const avg_rating = agg?.avg ? Math.round(agg.avg * 10) / 10 : 0

    await db
        .collection('tournaments')
        .updateOne({ _id: tId }, { $set: { review_count, avg_rating } })

    return { review_count, avg_rating }
}

export async function getTournamentReviews(req, res, db) {
    try {
        const tId = oid(req.params.id)
        if (!tId) return res.status(400).json({ message: 'Invalid tournament id.' })

        const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50)
        const page = Math.max(parseInt(req.query.page ?? '1', 10), 1)
        const skip = (page - 1) * limit

        const cursor = db.collection('reviews').aggregate([
            { $match: { tournament_id: tId } },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'author',
                    pipeline: [
                        { $project: { _id: 1, username: 1, full_name: 1, profile_image_url: 1 } },
                    ],
                },
            },
            { $addFields: { author: { $first: '$author' } } },
        ])

        const items = []
        for await (const r of cursor) {
            items.push({
                _id: r._id,
                rating: r.rating,
                comment: r.comment ?? '',
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                author: pickUserPublic(r.author),
                user_id: r.user_id,
            })
        }

        const t = await db
            .collection('tournaments')
            .findOne({ _id: tId }, { projection: { avg_rating: 1, review_count: 1 } })

        res.json({
            items,
            page,
            limit,
            avg_rating: t?.avg_rating ?? 0,
            review_count: t?.review_count ?? items.length,
        })
    } catch (e) {
        console.error('getTournamentReviews error:', e)
        res.status(500).json({ message: 'Failed to load reviews.' })
    }
}

export async function upsertTournamentReview(req, res, db) {
    try {
        const tId = oid(req.params.id)
        if (!tId) return res.status(400).json({ message: 'Invalid tournament id.' })

        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: errors.array()[0].msg })
        }

        const requester =
            (req.user && (req.user.id || req.user._id)) || req.userId || req.user_id || null
        const uId = oid(requester)
        if (!uId) return res.status(401).json({ message: 'Unauthorized.' })

        const tournament = await db
            .collection('tournaments')
            .findOne({ _id: tId }, { projection: { _id: 1 } })
        if (!tournament) return res.status(404).json({ message: 'Tournament not found.' })

        const now = new Date()
        const rating = parseInt(req.body.rating, 10)
        const comment = String(req.body.comment ?? '').trim()

        const reviewsCol = db.collection('reviews')
        const filter = { tournament_id: tId, user_id: uId }
        const update = {
            $set: { rating, comment, updatedAt: now },
            $setOnInsert: { tournament_id: tId, user_id: uId, createdAt: now },
        }

        await reviewsCol.updateOne(filter, update, { upsert: true })

        const doc = await reviewsCol.findOne(filter, {
            projection: { rating: 1, comment: 1, createdAt: 1, updatedAt: 1, user_id: 1 },
        })

        const stats = await recalcTournamentRating(db, tId)

        res.status(201).json({
            review: {
                _id: doc._id,
                rating: doc.rating,
                comment: doc.comment,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                user_id: doc.user_id,
            },
            ...stats,
        })
    } catch (e) {
        console.error('upsertTournamentReview error:', e)
        res.status(500).json({ message: 'Failed to save review.' })
    }
}

export async function deleteReview(req, res, db) {
    try {
        const rId = oid(req.params.id)
        if (!rId) return res.status(400).json({ message: 'Invalid review id.' })

        const requester =
            (req.user && (req.user.id || req.user._id)) || req.userId || req.user_id || null
        const uId = oid(requester)
        if (!uId) return res.status(401).json({ message: 'Unauthorized.' })

        const reviewsCol = db.collection('reviews')
        const review = await reviewsCol.findOne({ _id: rId })
        if (!review) return res.status(404).json({ message: 'Review not found.' })

        const t = await db
            .collection('tournaments')
            .findOne({ _id: review.tournament_id }, { projection: { organizer: 1 } })

        const isAuthor = review.user_id?.equals?.(uId)
        const isOrganizer = t?.organizer && t.organizer.equals?.(uId)

        if (!isAuthor && !isOrganizer) {
            return res.status(403).json({ message: 'Forbidden.' })
        }

        await reviewsCol.deleteOne({ _id: rId })

        const stats = await recalcTournamentRating(db, review.tournament_id)

        res.json({ ok: true, ...stats })
    } catch (e) {
        console.error('deleteReview error:', e)
        res.status(500).json({ message: 'Failed to delete review.' })
    }
}
