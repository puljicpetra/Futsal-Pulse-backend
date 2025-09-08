import { MongoClient } from 'mongodb'
import { config } from 'dotenv'

config()

let mongoURI = process.env.MONGO_URI
let db_name = process.env.MONGO_DB_NAME

export async function connectToDatabase() {
    try {
        const client = new MongoClient(mongoURI)
        await client.connect()
        console.log('Uspješno spajanje na bazu podataka')
        const db = client.db(db_name)
        return db
    } catch (error) {
        console.error('Greška prilikom spajanja na bazu podataka', error)
        throw error
    }
}

async function ensureIndexByKeys(coll, keys, options = {}) {
    const wanted = JSON.stringify(keys)
    const existing = await coll.indexes()
    const hit = existing.find((ix) => JSON.stringify(ix.key) === wanted)
    if (hit) {
        console.log(`[indexes] ${coll.collectionName}: index already exists`, ixKeyToStr(keys))
        return
    }
    try {
        await coll.createIndex(keys, options)
        console.log(
            `[indexes] ${coll.collectionName}: created`,
            ixKeyToStr(keys),
            options?.name || ''
        )
    } catch (e) {
        if (e?.code === 85) {
            console.warn(`[indexes] ${coll.collectionName}: exists under another name, skipping`)
            return
        }
        throw e
    }
}

function ixKeyToStr(obj) {
    return Object.entries(obj)
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
}

export async function ensureIndexes(db) {
    try {
        await ensureIndexByKeys(
            db.collection('registrations'),
            { teamId: 1, tournamentId: 1 },
            { unique: true, name: 'uniq_team_in_tournament' }
        )

        await ensureIndexByKeys(
            db.collection('tournament_subscriptions'),
            { tournamentId: 1, userId: 1 },
            { unique: true, name: 'uniq_sub_per_tournament' }
        )

        await ensureIndexByKeys(
            db.collection('tournament_announcements'),
            { tournamentId: 1, createdAt: -1 },
            { name: 'ann_tournament_createdAt' }
        )

        console.log('[indexes] all OK')
    } catch (err) {
        console.error('[indexes] Failed creating indexes:', err?.message || err)
        throw err
    }
}
