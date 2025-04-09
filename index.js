import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './db.js';
import { hashPassword, checkPassword, generateJWT, verifyJWT, authMiddleware } from './auth.js';

const app = express();
let db = await connectToDatabase();

let users = []

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend radi!');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
  
    const existing = users.find(u => u.username === username);
    if (existing) return res.status(400).send('Korisničko ime već postoji');
  
    const hashedPassword = await hashPassword(password);
    if (!hashedPassword) return res.status(500).send('Greška u hashiranju lozinke');
  
    const user = {
      id: users.length + 1,
      username,
      password: hashedPassword,
    };
  
    users.push(user);
    res.status(201).json({ message: 'Registracija uspješna' });
});  

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
  
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).send('Neuspješna prijava');
  
    const isValid = await checkPassword(password, user.password);
    if (!isValid) return res.status(401).send('Neuspješna prijava');
  
    const token = generateJWT({ id: user.id, username: user.username });
    if (!token) return res.status(500).send('Greška u generiranju tokena');
  
    res.status(200).json({ jwt_token: token });
});  

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server radi na http://localhost:${PORT}`);
});
