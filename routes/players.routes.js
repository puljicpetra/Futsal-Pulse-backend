import { Router } from 'express'
import {
    searchPlayers,
    getPlayerStats,
    getPlayerMatchLog,
} from '../controllers/players.controller.js'

const router = Router()

router.get('/search', (req, res) => searchPlayers(req, res, req.db))
router.get('/:playerId/stats', (req, res) => getPlayerStats(req, res, req.db))
router.get('/:playerId/matches', (req, res) => getPlayerMatchLog(req, res, req.db))

export default router
