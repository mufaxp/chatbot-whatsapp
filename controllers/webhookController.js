const pool = require('../database/connection');

const {
    sendMessage,
    sendMessageWithDelay
} = require('../services/whatsapp');

const categories = {
    '1': 'Jaringan Internet',
    '2': 'Akun siswa (tidak bisa login, lupa password, dsb)',
    '3': 'Aplikasi ujian (SEB error, token, dsb)'
};

// ======================
// MENU UTAMA
// ======================

function mainMenu() {

    return (
        `Selamat datang di layanan pengaduan.\n\n` +
        `1. Jaringan Internet\n` +
        `2. Akun siswa (tidak bisa login, lupa password, dsb)\n` +
        `3. Aplikasi ujian (SEB error, token, dsb)\n\n` +
        `Silakan pilih layanan.`
    );
}

// ======================
// CEK OPERATOR
// ======================

async function isOperator(number) {

    const [rows] = await pool.query(
        'SELECT * FROM operators WHERE operator_number = ?',
        [number]
    );

    return rows.length > 0;
}

// ======================
// CEK OPERATOR PUNYA TIKET AKTIF
// ======================

async function operatorHasActiveTicket(operatorNumber) {

    const [rows] = await pool.query(
        `SELECT * FROM tickets
        WHERE operator_number = ?
        AND status = 'PROCESS'
        LIMIT 1`,
        [operatorNumber]
    );

    return rows.length > 0;
}

// ======================
// KIRIM TIKET BERIKUTNYA
// ======================

async function dispatchNextTicket(operatorNumber) {

    // cari tiket waiting paling lama
    const [ticketRows] = await pool.query(
        `SELECT * FROM tickets
        WHERE operator_number = ?
        AND status = 'WAITING'
        ORDER BY created_at ASC
        LIMIT 1`,
        [operatorNumber]
    );

    // jika tidak ada antrean
    if (ticketRows.length === 0) {
        return;
    }

    const ticket = ticketRows[0];

    // update jadi PROCESS
    await pool.query(
        `UPDATE tickets
        SET status = 'PROCESS'
        WHERE id = ?`,
        [ticket.id]
    );

    // kirim tiket ke operator
    await sendMessageWithDelay(
        operatorNumber,
        `TIKET AKTIF\n\n` +
        `Nomor Antrean: ${ticket.queue_number}\n` +
        `Kategori: ${ticket.category}\n` +
        `User: ${ticket.sender}\n\n` +
        `Keluhan:\n${ticket.complaint}`
    );

    // info ke user
    await sendMessageWithDelay(
        ticket.sender,
        `Operator sedang menyelesaikan kendala Anda.\n\n` +
        `Nomor antrean: ${ticket.queue_number}`
    );
}

// ======================
// HANDLE OPERATOR SELESAI
// ======================

async function handleOperatorDone(sender, message) {

    if (!message.startsWith('#SELESAI')) {
        return;
    }

    const report =
        message.replace('#SELESAI', '').trim();

    // cari tiket PROCESS milik operator
    const [ticketRows] = await pool.query(
        `SELECT * FROM tickets
        WHERE operator_number = ?
        AND status = 'PROCESS'
        LIMIT 1`,
        [sender]
    );

    // jika tidak ada tiket aktif
    if (ticketRows.length === 0) {

        return sendMessageWithDelay(
            sender,
            'Tidak ada tiket aktif.'
        );
    }

    const ticket = ticketRows[0];

    // update DONE
    await pool.query(
        `UPDATE tickets
        SET status = 'DONE'
        WHERE id = ?`,
        [ticket.id]
    );

    // kirim laporan ke user
    await sendMessageWithDelay(
        ticket.sender,
        `Laporan kendala selesai.\n\n` +
        `${report}\n\n` +
        `Status: DONE`
    );

    // konfirmasi operator
    await sendMessageWithDelay(
        sender,
        `Tiket antrean ${ticket.queue_number} selesai.`
    );

    // kirim tiket berikutnya
    await dispatchNextTicket(sender);
}

// ======================
// WEBHOOK UTAMA
// ======================

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

        // validasi
        if (!sender || !message) {
            return;
        }

        // ======================
        // MODE OPERATOR
        // ======================

        const operatorCheck =
            await isOperator(sender);

        if (
            operatorCheck &&
            message.startsWith('#SELESAI')
        ) {

            await handleOperatorDone(
                sender,
                message
            );

            return;
        }

        // ======================
        // MODE USER
        // ======================

        // cek session
        const [sessionRows] = await pool.query(
            'SELECT * FROM sessions WHERE sender = ?',
            [sender]
        );

        // ======================
        // BELUM ADA SESSION
        // ======================

        if (sessionRows.length === 0) {

            await pool.query(
                `INSERT INTO sessions
                (sender, step)
                VALUES (?, ?)`,
                [sender, 'choose_category']
            );

            return sendMessageWithDelay(
                sender,
                mainMenu()
            );
        }

        const session = sessionRows[0];

        // ======================
        // PILIH KATEGORI
        // ======================

        if (session.step === 'choose_category') {

            // jika pilihan tidak valid
            if (!categories[message]) {

                return sendMessageWithDelay(
                    sender,
                    `Pilihan tidak valid.\n\n${mainMenu()}`
                );
            }

            // update session
            await pool.query(
                `UPDATE sessions
                SET step = ?, category = ?
                WHERE sender = ?`,
                [
                    'waiting_complaint',
                    message,
                    sender
                ]
            );

            return sendMessageWithDelay(
                sender,
                `Anda memilih ${categories[message]}.\n\n` +
                `Silakan kirim detail keluhan Anda.`
            );
        }

        // ======================
        // MENUNGGU KELUHAN
        // ======================

        if (session.step === 'waiting_complaint') {

            const categoryName =
                categories[session.category];

            // cari operator
            const [operatorRows] = await pool.query(
                `SELECT * FROM operators
                WHERE category_code = ?
                LIMIT 1`,
                [session.category]
            );

            // operator tidak tersedia
            if (operatorRows.length === 0) {

                return sendMessageWithDelay(
                    sender,
                    'Operator tidak tersedia.'
                );
            }

            const operator = operatorRows[0];

            // hitung antrean
            const [queueRows] = await pool.query(
                `SELECT COUNT(*) as total
                FROM tickets
                WHERE operator_number = ?
                AND status IN ('WAITING', 'PROCESS')`,
                [operator.operator_number]
            );

            const queueNumber =
                queueRows[0].total + 1;

            // simpan tiket
            await pool.query(
                `INSERT INTO tickets
                (
                    ticket_number,
                    queue_number,
                    sender,
                    category,
                    complaint,
                    operator_number,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    'TCK-' + Date.now(),
                    queueNumber,
                    sender,
                    categoryName,
                    message,
                    operator.operator_number,
                    'WAITING'
                ]
            );

            // info ke user
            await sendMessageWithDelay(
                sender,
                `Keluhan Anda sudah diterima.\n\n` +
                `Nomor antrean Anda: ${queueNumber}\n\n` +
                `Mohon tunggu operator kami.`
            );

            // hapus session
            await pool.query(
                'DELETE FROM sessions WHERE sender = ?',
                [sender]
            );

            // cek operator sedang sibuk atau tidak
            const busy =
                await operatorHasActiveTicket(
                    operator.operator_number
                );

            // jika operator kosong
            if (!busy) {

                await dispatchNextTicket(
                    operator.operator_number
                );
            }

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