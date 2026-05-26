const axios = require('axios');

function delay(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// random delay:
// 2000, 3000, 4000, 5000 ms
async function randomDelay() {

    const time =
        (
            Math.floor(
                Math.random() * 4
            ) + 2
        ) * 1000;

    console.log(
        `Delay ${time} ms`
    );

    await delay(time);
}

// ======================
// SEND MESSAGE
// ======================

async function sendMessage(
    target,
    message
) {

    try {

        const response =
            await axios.post(

                'https://api.fonnte.com/send',

                {
                    target,
                    message
                },

                {
                    headers: {
                        Authorization:
                            process.env.FONNTE_TOKEN
                    }
                }
            );

        console.log(response.data);

    } catch (error) {

        console.log(
            'ERROR SEND MESSAGE'
        );

        console.log(error.response?.data);
    }
}

// ======================
// SEND MESSAGE WITH DELAY
// ======================

async function sendMessageWithDelay(
    target,
    message
) {

    await randomDelay();

    await sendMessage(
        target,
        message
    );
}

module.exports = {
    sendMessage,
    sendMessageWithDelay
};