require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();

app.use(express.json());

app.post('/webhook', async (req, res) => {

    console.log(req.body);

    const sender = req.body.sender;
    const message = req.body.message;

    console.log("Pesan dari:", sender);
    console.log("Isi pesan:", message);

    try {

        await axios.post(
            'https://api.fonnte.com/send',
            {
                target: sender,
                message: 'Halo, pesan Anda sudah diterima.'
            },
            {
                headers: {
                    Authorization: process.env.FONNTE_TOKEN
                }
            }
        );

        res.status(200).send('OK');

    } catch (error) {

        console.log(error.response.data);

        res.status(500).send('ERROR');
    }

});

app.listen(3000, () => {
    console.log('Server berjalan di port 3000');
});