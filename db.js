import { MongoClient } from 'mongodb'
import { config } from 'dotenv'

config()

let mongoURI = process.env.MONGO_URI
let db_name = process.env.MONGO_DB_NAME

async function connectToDatabase() {
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

async function ensureIndexes(db) {
    try {
        await db
            .collection('registrations')
            .createIndex(
                { teamId: 1, tournamentId: 1 },
                { unique: true, name: 'uniq_team_in_tournament' }
            )
        console.log('[indexes] registrations: uniq_team_in_tournament OK')
    } catch (err) {
        console.error('[indexes] Failed creating registrations unique index:', err?.message || err)
        throw err
    }
}

export { connectToDatabase, ensureIndexes }
