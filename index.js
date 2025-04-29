import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './db.js';
import { hashPassword, checkPassword, generateJWT, verifyJWT, authMiddleware } from './auth.js';
import { body, validationResult } from 'express-validator';

const app = express();
let db;

async function startServer() {
    try {
        db = await connectToDatabase();

        app.use(cors());
        app.use(express.json());

        app.get('/', (req, res) => {
            res.send('Backend is working!');
        });

        const registerValidationRules = [
          body('username')
            .trim()
            .notEmpty().withMessage('Username is required.'),
          body('email')
            .isEmail().withMessage('Please provide a valid email address.')
            .normalizeEmail(),
          body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
          body('role')
             .trim()
             .notEmpty().withMessage('Role is required.')
             // .isIn(['organizer', 'player', 'fan']).withMessage('Invalid role specified.')
        ];

        app.post('/register', registerValidationRules, async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({
                status: 'fail',
                errors: errors.array()
              });
            }

            const { username, email, password, role } = req.body;

            try {
              const existingUser = await db.collection('users').findOne({
                $or: [{ username }, { email }]
              });

              if (existingUser) {
                return res.status(409).send('Username or email already exists.');
              }

              const hashedPassword = await hashPassword(password);
              if (!hashedPassword) {
                 console.error('Password hashing failed for user:', username);
                 return res.status(500).send('An error occurred during registration process.');
              }

              const newUser = {
                username,
                email,
                password: hashedPassword,
                role,
                createdAt: new Date()
              };

              const insertResult = await db.collection('users').insertOne(newUser);

              if (!insertResult.acknowledged || !insertResult.insertedId) {
                  console.error('Database insertion failed for user:', username);
                  return res.status(500).send('An error occurred saving registration data.');
              }

              res.status(201).json({ message: 'Registration successful.' });

            } catch (err) {
              console.error('Error during /register route:', err);
              res.status(500).send('An internal server error occurred during registration.');
            }
        });

        app.post('/login', async (req, res) => {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).send('Username and password are required.');
            }

            try {
              const user = await db.collection('users').findOne({ username });

              if (!user) return res.status(401).send('Login failed. Invalid credentials.');

              const isValid = await checkPassword(password, user.password);
              if (!isValid) return res.status(401).send('Login failed. Invalid credentials.');

              const token = generateJWT({ id: user._id, username: user.username, role: user.role });
              if (!token) {
                  console.error('Token generation failed for user:', username);
                  return res.status(500).send('An error occurred during login (token generation).');
              }

              res.status(200).json({ jwt_token: token, role: user.role });
            } catch (err) {
              console.error('Error during /login route:', err);
              res.status(500).send('An internal server error occurred during login.');
            }
        });

        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("Failed to connect to the database. Server not started.", error);
        process.exit(1);
    }
}

startServer();