import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './db.js';
import { hashPassword, checkPassword, generateJWT, verifyJWT, authMiddleware } from './auth.js';

const app = express();
let db = await connectToDatabase();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend is working!');
});

app.post('/register', async (req, res) => {
    const { username, email, password, role } = req.body;
  
    if (!username || !email || !password || !role) {
      return res.status(400).send('All fields are required.');
    }
  
    try {
      const existingUser = await db.collection('users').findOne({
        $or: [{ username }, { email }]
      });
  
      if (existingUser) {
        return res.status(400).send('Username or email already exists.');
      }
  
      const hashedPassword = await hashPassword(password);
      if (!hashedPassword) {
        return res.status(500).send('Error hashing password.');
      }
  
      const newUser = {
        username,
        email,
        password: hashedPassword,
        role,
        createdAt: new Date()
      };
  
      await db.collection('users').insertOne(newUser);
      res.status(201).json({ message: 'Registration successful.' });
  
    } catch (err) {
      console.error('Error during registration:', err);
      res.status(500).send('An error occurred during registration.');
    }
});   

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
  
    try {
      const user = await db.collection('users').findOne({ username });
  
      if (!user) return res.status(401).send('Login failed. User not found.');
  
      const isValid = await checkPassword(password, user.password);
      if (!isValid) return res.status(401).send('Login failed. Wrong password.');
  
      const token = generateJWT({ id: user._id, username: user.username, role: user.role });
      if (!token) return res.status(500).send('Token generation failed.');
  
      res.status(200).json({ jwt_token: token, role: user.role });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).send('An error occurred during login.');
    }
  });  

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server radi na http://localhost:${PORT}`);
});
