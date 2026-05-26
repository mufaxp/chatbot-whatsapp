require('dotenv').config();

const express = require('express');

const webhookRoutes =
    require('./routes/webhookRoutes');

const app = express();

app.use(express.json());

app.use('/', webhookRoutes);

app.listen(3000, () => {
    console.log('Server berjalan di port 3000');
});