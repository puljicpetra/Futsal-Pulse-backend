import express from 'express';

const app = express();

app.get('/', (req, res) => {
    res.send('Backend radi!');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server radi na http://localhost:${PORT}`);
});
