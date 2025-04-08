import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './db.js';

const app = express();
let db = await connectToDatabase();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend radi!');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server radi na http://localhost:${PORT}`);
});
