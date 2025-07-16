import { ObjectId } from 'mongodb';

export const createTournament = async (req, res, db) => {
    if (req.user.role !== 'organizer') {
        return res.status(403).json({ message: 'Forbidden: Only organizers can create tournaments.' });
    }

    try {
        const { name, location, startDate, endDate, rules, surface } = req.body;
        
        if (!name || !location || !startDate || !surface) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }

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

        res.status(201).json({ 
            message: 'Tournament created successfully!', 
            tournament: { _id: result.insertedId, ...newTournament } 
        });

    } catch (error) {
        console.error("Error creating tournament:", error);
        if (error instanceof SyntaxError) {
            return res.status(400).json({ message: 'Invalid format for location data.' });
        }
        res.status(500).json({ message: 'Server error while creating tournament.' });
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

        const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(id) });
        
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        res.status(200).json(tournament);

    } catch (error) {
        console.error("Error fetching tournament by ID:", error);
        res.status(500).json({ message: 'Server error while fetching tournament details.' });
    }
};