import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './db.js';
import { hashPassword, checkPassword, generateJWT, verifyJWT, authMiddleware } from './auth.js';
import { body, validationResult } from 'express-validator';
import { ObjectId } from 'mongodb';

import multer from 'multer';
import path from 'path';

const app = express();
let db;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });


async function startServer() {
    try {
        db = await connectToDatabase();

        app.use(cors());
        app.use(express.json());

        app.use('/uploads', express.static('uploads'));

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
             .isIn(['organizer', 'player', 'fan']).withMessage('Invalid role specified.')
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
                return res.status(409).json({ message: 'Username or email already exists.' });
              }

              const hashedPassword = await hashPassword(password);
              if (!hashedPassword) {
                 console.error('Password hashing failed for user:', username);
                 return res.status(500).json({ message: 'An error occurred during registration process.' });
              }

              const newUser = {
                username,
                email,
                password: hashedPassword,
                role,
                full_name: '',
                profile_image_url: '',
                bio: '',
                contact_phone: '',
                createdAt: new Date(),
                updatedAt: new Date()
              };

              const insertResult = await db.collection('users').insertOne(newUser);

              if (!insertResult.acknowledged || !insertResult.insertedId) {
                  console.error('Database insertion failed for user:', username);
                  return res.status(500).json({ message: 'An error occurred saving registration data.' });
              }

              res.status(201).json({ message: 'Registration successful.' });

            } catch (err) {
              console.error('Error during /register route:', err);
              res.status(500).json({ message: 'An internal server error occurred during registration.' });
            }
        });

        app.post('/login', async (req, res) => {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ message: 'Username and password are required.' });
            }

            try {
              const user = await db.collection('users').findOne({ username });

              if (!user) return res.status(401).json({ message: 'Login failed. Invalid credentials.' });

              const isValid = await checkPassword(password, user.password);
              if (!isValid) return res.status(401).json({ message: 'Login failed. Invalid credentials.' });

              const token = generateJWT({ id: user._id.toString(), username: user.username, role: user.role });
              if (!token) {
                  console.error('Token generation failed for user:', username);
                  return res.status(500).json({ message: 'An error occurred during login (token generation).' });
              }

              res.status(200).json({ jwt_token: token, role: user.role });
            } catch (err) {
              console.error('Error during /login route:', err);
              res.status(500).json({ message: 'An internal server error occurred during login.' });
            }
        });

        const apiRouter = express.Router();

        apiRouter.get('/users/me', authMiddleware, async (req, res) => {
            try {
                if (!req.user || !req.user.id) {
                    return res.status(401).json({ message: 'User not authenticated or ID missing.' });
                }

                const userId = new ObjectId(req.user.id);
                const userProfile = await db.collection('users').findOne(
                    { _id: userId },
                    { projection: { password: 0, createdAt: 0, updatedAt: 0 } }
                );

                if (!userProfile) {
                    return res.status(404).json({ message: 'User profile not found.' });
                }

                res.status(200).json(userProfile);
            } catch (error) {
                console.error('Error fetching user profile:', error);
                if (error.message.includes("Argument passed in must be a single String")) {
                    return res.status(400).json({ message: 'Invalid user ID format.' });
                }
                res.status(500).json({ message: 'Server error while fetching profile.' });
            }
        });

        const updateProfileValidationRules = [
            body('full_name').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters.'),
            body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters.'),
            body('contact_phone').optional().trim().matches(/^\+?[0-9\s\-()]{7,20}$/).withMessage('Invalid phone number format.'),
        ];

        apiRouter.put('/users/me', authMiddleware, updateProfileValidationRules, async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return res.status(400).json({ status: 'fail', errors: errors.array() });
            }

            try {
                if (!req.user || !req.user.id) {
                    return res.status(401).json({ message: 'User not authenticated or ID missing.' });
                }

                const userId = new ObjectId(req.user.id);
                const updates = {};
                const allowedUpdates = ['full_name', 'bio', 'contact_phone'];

                for (const key of allowedUpdates) {
                    if (req.body[key] !== undefined) {
                        updates[key] = req.body[key];
                    }
                }

                if (Object.keys(updates).length === 0) {
                    return res.status(400).json({ message: 'No update fields provided.' });
                }

                updates.updatedAt = new Date();

                const result = await db.collection('users').updateOne(
                    { _id: userId },
                    { $set: updates }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: 'User not found for update.' });
                }

                const updatedUserProfile = await db.collection('users').findOne(
                    { _id: userId },
                    { projection: { password: 0, createdAt: 0, updatedAt: 0 } }
                );

                res.status(200).json(updatedUserProfile);

            } catch (error) {
                console.error('Error updating user profile:', error);
                if (error.message.includes("Argument passed in must be a single String")) {
                    return res.status(400).json({ message: 'Invalid user ID format.' });
                }
                res.status(500).json({ message: 'Server error while updating profile.' });
            }
        });

        apiRouter.post('/users/me/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
          try {
            if (!req.file) {
              return res.status(400).json({ message: 'No file uploaded.' });
            }
    
            const userId = new ObjectId(req.user.id);
            const avatarUrl = `/uploads/${req.file.filename}`;
    
            const result = await db.collection('users').updateOne(
              { _id: userId },
              { $set: { profile_image_url: avatarUrl, updatedAt: new Date() } }
            );
    
            if (result.matchedCount === 0) {
              return res.status(404).json({ message: 'User not found.' });
            }
            
            res.status(200).json({ profile_image_url: avatarUrl });
    
          } catch (error) {
            console.error('Error uploading avatar:', error);
            res.status(500).json({ message: 'Server error while uploading image.' });
          }
        });

        app.use('/api', apiRouter);

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