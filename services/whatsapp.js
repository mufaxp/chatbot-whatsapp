require('dotenv').config();

const axios = require('axios');

async function sendMessage(target, message) {

    try {

        console.log('====================');
        console.log('MENGIRIM PESAN');
        console.log('TARGET:', target);
        console.log('MESSAGE:', message);

        const response = await axios.post(
            'https://api.fonnte.com/send',
            {
                target: target,
                message: message
            },
            {
                headers: {
                    Authorization: process.env.FONNTE_TOKEN
                }
            }
        );

        console.log('RESPON FONNTE:');
        console.log(response.data);

    } catch (error) {

        console.log('ERROR FONNTE');

        if (error.response) {
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }

    }

}

module.exports = {
    sendMessage
};