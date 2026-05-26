const pool = require('../database/connection');

const { sendMessage } = require('../services/whatsapp');

const categories = {
    '1': 'Jaringan Internet',
    '2': 'Kendala LMS',
    '3': 'Server Ujian'
};

async function webhook(req, res) {

    res.send('OK');

    const sender = req.body.sender;
    const message = req.body.message?.trim();

    // cek session user
    const [sessionRows] = await pool.query(
        'SELECT * FROM sessions WHERE sender = ?',
        [sender]
    );

    // jika belum ada session
    if (sessionRows.length === 0) {

        await pool.query(
            'INSERT INTO sessions (sender, step) VALUES (?, ?)',
            [sender, 'choose_category']
        );

        return sendMessage(
            sender,
            `Selamat datang di layanan pengaduan.\n\n` +
            `1. Jaringan Internet\n` +
            `2. Kendala LMS\n` +
            `3. Server Ujian\n\n` +
            `Silakan pilih layanan.`
        );
    }

    const session = sessionRows[0];

    // pilih kategori
    if (session.step === 'choose_category') {

        if (!categories[message]) {

            return sendMessage(
                sender,
                'Pilihan tidak valid.'
            );
        }

        await pool.query(
            'UPDATE sessions SET step = ?, category = ? WHERE sender = ?',
            ['waiting_complaint', message, sender]
        );

        return sendMessage(
            sender,
            `Anda memilih ${categories[message]}.\n\n` +
            `Silakan kirim detail keluhan Anda.`
        );
    }

    // menerima keluhan
    if (session.step === 'waiting_complaint') {

        const ticketNumber =
            'TCK-' + Date.now();

        const categoryName =
            categories[session.category];

        // cari operator
        const [operatorRows] = await pool.query(
            'SELECT * FROM operators WHERE category_code = ? LIMIT 1',
            [session.category]
        );

        const operator = operatorRows[0];

        // simpan tiket
        await pool.query(
            `INSERT INTO tickets
            (ticket_number, sender, category, complaint, operator_number)
            VALUES (?, ?, ?, ?, ?)`,
            [
                ticketNumber,
                sender,
                categoryName,
                message,
                operator.operator_number
            ]
        );

        // kirim ke operator
        await sendMessage(
            operator.operator_number,
            `TIKET BARU\n\n` +
            `No Tiket: ${ticketNumber}\n` +
            `Kategori: ${categoryName}\n` +
            `User: ${sender}\n\n` +
            `Keluhan:\n${message}`
        );

        // balas ke user
        await sendMessage(
            sender,
            `Keluhan Anda sudah diterima.\n\n` +
            `No Tiket: ${ticketNumber}\n` +
            `Kategori: ${categoryName}\n\n` +
            `Mohon tunggu operator kami.`
        );

        // hapus session
        await pool.query(
            'DELETE FROM sessions WHERE sender = ?',
            [sender]
        );
    }

}

module.exports = {
    webhook
};