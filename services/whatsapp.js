require('dotenv').config();

const axios = require('axios');

async function sendMessage(target, message) {

    try {

        await axios.post(
            'https://api.fonnte.com/send',
            {
                target,
                message
            },
            {
                headers: {
                    Authorization: process.env.FONNTE_TOKEN
                }
            }
        );

        console.log('Pesan terkirim');

    } catch (error) {

        console.log(error.response?.data || error.message);

    }

}

module.exports = {
    sendMessage
};