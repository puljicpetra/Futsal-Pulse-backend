import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { connectToDatabase } from './db.js';

import { createAuthRouter } from './routes/auth.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import { createTournamentRouter } from './routes/tournament.routes.js';
import { createTeamRouter } from './routes/team.routes.js';
import { createRegistrationRouter } from './routes/registration.routes.js';
import { createInvitationRouter } from './routes/invitation.routes.js';
import { createNotificationRouter } from './routes/notification.routes.js';
import { createMatchRouter } from './routes/match.routes.js';

const app = express();
let db;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

async function startServer() {
    try {
        db = await connectToDatabase();

        app.use(cors());
        app.use(express.json());
        app.use('/uploads', express.static('uploads'));

        app.get('/', (req, res) => res.send('Futsal Pulse Backend is running!'));

        const authRouter = createAuthRouter(db);
        const userRouter = createUserRouter(db, upload);
        const tournamentRouter = createTournamentRouter(db, upload);
        const teamRouter = createTeamRouter(db);
        const registrationRouter = createRegistrationRouter(db);
        const invitationRouter = createInvitationRouter(db);
        const notificationRouter = createNotificationRouter(db);
        const matchRouter = createMatchRouter(db);
        
        app.use('/auth', authRouter);
        app.use('/api/users', userRouter);
        app.use('/api/tournaments', tournamentRouter);
        app.use('/api/teams', teamRouter);
        app.use('/api/registrations', registrationRouter);
        app.use('/api/invitations', invitationRouter);
        app.use('/api/notifications', notificationRouter);
        app.use('/api/matches', matchRouter);
        
        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));

    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();