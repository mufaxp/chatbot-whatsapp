const pool = require('../database/connection');

const { sendMessage } = require('../services/whatsapp');

const categories = {
    '1': 'Jaringan Internet',
    '2': 'Kendala LMS',
    '3': 'Server Ujian'
};

// cek apakah nomor adalah operator
async function isOperator(number) {

    const [rows] = await pool.query(
        'SELECT * FROM operators WHERE operator_number = ?',
        [number]
    );

    return rows.length > 0;
}

// handle balasan operator
async function handleOperatorReply(sender, message) {

    // format:
    // #SELESAI TCK-xxx
    // isi laporan

    if (!message.startsWith('#SELESAI')) {
        return;
    }

    const lines = message.split('\n');

    const firstLine = lines[0];

    const ticketNumber =
        firstLine.replace('#SELESAI', '').trim();

    const report =
        lines.slice(1).join('\n');

    // cari tiket
    const [ticketRows] = await pool.query(
        'SELECT * FROM tickets WHERE ticket_number = ?',
        [ticketNumber]
    );

    // jika tiket tidak ditemukan
    if (ticketRows.length === 0) {

        return sendMessage(
            sender,
            'Ticket tidak ditemukan.'
        );
    }

    const ticket = ticketRows[0];

    // update status tiket
    await pool.query(
        'UPDATE tickets SET status = ? WHERE ticket_number = ?',
        ['DONE', ticketNumber]
    );

    // kirim hasil ke user
    await sendMessage(
        ticket.sender,
        `Laporan tiket selesai.\n\n` +
        `No Tiket: ${ticketNumber}\n\n` +
        `${report}\n\n` +
        `Status: DONE`
    );

    // konfirmasi ke operator
    await sendMessage(
        sender,
        `Tiket ${ticketNumber} berhasil diselesaikan.`
    );
}

// webhook utama
async function webhook(req, res) {

    try {

        console.log('====================');
        console.log('WEBHOOK MASUK');
        console.log(req.body);

        res.send('OK');

        const sender = req.body.sender;
        const message = req.body.message?.trim();

        console.log('SENDER:', sender);
        console.log('MESSAGE:', message);

        // validasi basic
        if (!sender || !message) {
            return;
        }

        // cek apakah operator
        const operatorCheck =
            await isOperator(sender);

        // hanya proses command operator
        if (
            operatorCheck &&
            message.startsWith('#SELESAI')
        ) {

            await handleOperatorReply(
                sender,
                message
            );

            return;
        }

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

        // step pilih kategori
        if (session.step === 'choose_category') {

            if (!categories[message]) {

                return sendMessage(
                    sender,
                    'Pilihan tidak valid.\nSilakan pilih 1, 2, atau 3.'
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

        // step menunggu keluhan
        if (session.step === 'waiting_complaint') {

            const ticketNumber =
                'TCK-' + Date.now();

            const categoryName =
                categories[session.category];

            // cari operator sesuai kategori
            const [operatorRows] = await pool.query(
                'SELECT * FROM operators WHERE category_code = ? LIMIT 1',
                [session.category]
            );

            // jika operator tidak ditemukan
            if (operatorRows.length === 0) {

                return sendMessage(
                    sender,
                    'Operator tidak tersedia.'
                );
            }

            const operator = operatorRows[0];

            // simpan tiket
            await pool.query(
                `INSERT INTO tickets
                (
                    ticket_number,
                    sender,
                    category,
                    complaint,
                    operator_number
                )
                VALUES (?, ?, ?, ?, ?)`,
                [
                    ticketNumber,
                    sender,
                    categoryName,
                    message,
                    operator.operator_number
                ]
            );

            // kirim tiket ke operator
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

            return;
        }

    } catch (error) {

        console.log('ERROR WEBHOOK');
        console.log(error);

    }
}

module.exports = {
    webhook
};