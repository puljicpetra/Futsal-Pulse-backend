import { ObjectId } from 'mongodb';
import { validationResult } from 'express-validator';

export const createTournament = async (req, res, db) => {
    if (req.user.role !== 'organizer') {
        return res.status(403).json({ message: 'Forbidden: Only organizers can create tournaments.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, location, startDate, endDate, rules, surface } = req.body;

        const newTournament = {
            name,
            location: JSON.parse(location),
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            rules: rules || '',
            surface,
            imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
            organizer: new ObjectId(req.user.id),
            teams: [],
            matches: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('tournaments').insertOne(newTournament);

        const createdTournament = await db.collection('tournaments').findOne({ _id: result.insertedId });

        res.status(201).json({ 
            message: 'Tournament created successfully!', 
            tournament: createdTournament
        });

    } catch (error) {
        console.error("Error creating tournament:", error);
        res.status(500).json({ message: 'Server error while saving tournament data.' });
    }
};

export const getAllTournaments = async (req, res, db) => {
    try {
        const filters = {};
        const { city, surface } = req.query;

        if (city) {
            filters['location.city'] = { $regex: city, $options: 'i' };
        }

        if (surface) {
            filters.surface = surface;
        }

        const tournaments = await db.collection('tournaments')
            .find(filters)
            .sort({ startDate: -1 })
            .toArray();
            
        res.status(200).json(tournaments);

    } catch (error) {
        console.error("Error fetching tournaments:", error);
        res.status(500).json({ message: 'Server error while fetching tournaments.' });
    }
};

export const getTournamentById = async (req, res, db) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid tournament ID.' });
        }

        const tournament = await db.collection('tournaments').aggregate([
            { $match: { _id: new ObjectId(id) } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'organizer',
                    foreignField: '_id',
                    as: 'organizerInfo'
                }
            },
            {
                $unwind: {
                    path: '$organizerInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    'organizerInfo.password': 0,
                    'organizerInfo.email': 0,
                }
            }
        ]).next();
        
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        res.status(200).json(tournament);

    } catch (error) {
        console.error("Error fetching tournament by ID:", error);
        res.status(500).json({ message: 'Server error while fetching tournament details.' });
    }
};

export const updateTournament = async (req, res, db) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const tournamentId = new ObjectId(id);

        const tournament = await db.collection('tournaments').findOne({ _id: tournamentId });

        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        if (tournament.organizer.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden: You are not the organizer of this tournament.' });
        }
        
        const allowedUpdates = ['name', 'location', 'startDate', 'endDate', 'rules', 'surface'];
        const updates = {};

        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                if(key === 'location') {
                    updates[key] = JSON.parse(req.body[key]);
                } else {
                    updates[key] = req.body[key];
                }
            }
        }
        
        if (req.file) {
            updates.imageUrl = `/uploads/${req.file.filename}`;
        }
        updates.updatedAt = new Date();

        await db.collection('tournaments').updateOne({ _id: tournamentId }, { $set: updates });

        const updatedTournament = await db.collection('tournaments').findOne({ _id: tournamentId });
        res.status(200).json(updatedTournament);

    } catch (error) {
        console.error("Error updating tournament:", error);
        res.status(500).json({ message: 'Server error while updating tournament.' });
    }
};

export const deleteTournament = async (req, res, db) => {
    try {
        const { id } = req.params;
        const tournamentId = new ObjectId(id);

        const tournament = await db.collection('tournaments').findOne({ _id: tournamentId });

        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        if (tournament.organizer.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden: You are not the organizer of this tournament.' });
        }

        await db.collection('tournaments').deleteOne({ _id: tournamentId });

        res.status(200).json({ message: 'Tournament deleted successfully.' });

    } catch (error) {
        console.error("Error deleting tournament:", error);
        res.status(500).json({ message: 'Server error while deleting tournament.' });
    }
};