import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend radi!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server radi na http://localhost:${PORT}`);
});
