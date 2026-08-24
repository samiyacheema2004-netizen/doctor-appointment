require("dotenv").config();
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const app = express();

// ========================================
// POSTGRESQL CONNECTION
// ========================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

// ========================================
// MIDDLEWARE
// ========================================

app.use(express.json());


// ========================================
// FRONTEND
// ========================================

app.use(
    express.static(
        path.join(__dirname, "frontented")
    )
);

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "frontented",
            "index.html"
        )
    );

});


// ========================================
// DATABASE TEST
// ========================================

app.get("/api/test", async (req, res) => {

    try {

        const result =
            await pool.query("SELECT NOW()");

        res.json({

            message:
                "PostgreSQL connected successfully!",

            time:
                result.rows[0].now

        });

    } catch (error) {

        console.log(
            "DATABASE ERROR:",
            error.message
        );

        res.status(500).json({

            message:
                "Database connection failed",

            error:
                error.message

        });

    }

});


// ========================================
// SIGN UP
// ========================================

app.post("/api/signup", async (req, res) => {

    const {
        name,
        email,
        password
    } = req.body;

    if (
        !name ||
        !email ||
        !password
    ) {

        return res.status(400).json({

            message:
                "Please fill all fields."

        });

    }

    if (password.length < 6) {

        return res.status(400).json({

            message:
                "Password must be at least 6 characters."

        });

    }

    try {

        const existingUser =
            await pool.query(
                "SELECT * FROM users WHERE email = $1",
                [email]
            );

        if (
            existingUser.rows.length > 0
        ) {

            return res.status(409).json({

                message:
                    "This email is already registered."

            });

        }

        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );

        const result =
            await pool.query(
                `INSERT INTO users
                (name, email, password)
                VALUES ($1, $2, $3)
                RETURNING id, name, email`,
                [
                    name,
                    email,
                    hashedPassword
                ]
            );

        res.status(201).json({

            message:
                "Account created successfully!",

            user:
                result.rows[0]

        });

    } catch (error) {

        console.log(
            "SIGNUP ERROR:",
            error.message
        );

        res.status(500).json({

            message:
                "Failed to create account.",

            error:
                error.message

        });

    }

});


// ========================================
// LOGIN
// ========================================

app.post("/api/login", async (req, res) => {

    const {
        email,
        password
    } = req.body;

    if (
        !email ||
        !password
    ) {

        return res.status(400).json({

            message:
                "Please enter email and password."

        });

    }

    try {

        const result =
            await pool.query(
                "SELECT * FROM users WHERE email = $1",
                [email]
            );

        if (
            result.rows.length === 0
        ) {

            return res.status(401).json({

                message:
                    "Invalid email or password."

            });

        }

        const user =
            result.rows[0];

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatch) {

            return res.status(401).json({

                message:
                    "Invalid email or password."

            });

        }

        res.json({

            message:
                "Login successful!",

            user: {

                id:
                    user.id,

                name:
                    user.name,

                email:
                    user.email

            }

        });

    } catch (error) {

        console.log(
            "LOGIN ERROR:",
            error.message
        );

        res.status(500).json({

            message:
                "Login failed.",

            error:
                error.message

        });

    }

});


// ========================================
// GET ALL APPOINTMENTS
// ========================================

app.get(
    "/api/appointments",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    "SELECT * FROM appointments ORDER BY id DESC"
                );

            res.json(
                result.rows
            );

        } catch (error) {

            console.log(
                "GET APPOINTMENTS ERROR:",
                error.message
            );

            res.status(500).json({

                message:
                    "Failed to get appointments.",

                error:
                    error.message

            });

        }

    }
);


// ========================================
// BOOK APPOINTMENT
// ========================================

app.post(
    "/api/appointments",
    async (req, res) => {

        const {
            doctorId,
            patientName,
            date,
            time
        } = req.body;


        if (
            !doctorId ||
            !patientName ||
            !date ||
            !time
        ) {

            return res.status(400).json({

                message:
                    "Please fill all fields."

            });

        }


        try {

            // Check duplicate slot

            const existingAppointment =
                await pool.query(
                    `SELECT *
                     FROM appointments
                     WHERE "doctorId" = $1
                     AND date = $2
                     AND time = $3`,
                    [
                        doctorId,
                        date,
                        time
                    ]
                );


            if (
                existingAppointment.rows.length > 0
            ) {

                return res.status(409).json({

                    message:
                        "This appointment slot is already booked. Please choose another time."

                });

            }


            // Save appointment

            const result =
                await pool.query(
                    `INSERT INTO appointments
                    ("doctorId", "patientName", date, time)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *`,
                    [
                        doctorId,
                        patientName,
                        date,
                        time
                    ]
                );


            console.log(
                "Appointment saved:",
                result.rows[0]
            );


            res.status(201).json({

                message:
                    "Appointment booked successfully!",

                appointment:
                    result.rows[0]

            });


        } catch (error) {

            console.log(
                "BOOKING ERROR:",
                error.message
            );

            res.status(500).json({

                message:
                    "Failed to save appointment.",

                error:
                    error.message

            });

        }

    }
);


// ========================================
// RESCHEDULE APPOINTMENT
// ========================================

app.put(
    "/api/appointments/:id",
    async (req, res) => {

        const appointmentId =
            req.params.id;

        const {
            date,
            time
        } = req.body;


        if (
            !date ||
            !time
        ) {

            return res.status(400).json({

                message:
                    "Please select date and time."

            });

        }


        try {

            // Find appointment

            const appointment =
                await pool.query(
                    `SELECT *
                     FROM appointments
                     WHERE id = $1`,
                    [appointmentId]
                );


            if (
                appointment.rows.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Appointment not found."

                });

            }


            const doctorId =
                appointment.rows[0].doctorId;


            // Check new slot

            const existingAppointment =
                await pool.query(
                    `SELECT *
                     FROM appointments
                     WHERE "doctorId" = $1
                     AND date = $2
                     AND time = $3
                     AND id != $4`,
                    [
                        doctorId,
                        date,
                        time,
                        appointmentId
                    ]
                );


            if (
                existingAppointment.rows.length > 0
            ) {

                return res.status(409).json({

                    message:
                        "This new time slot is already booked."

                });

            }


            // Update

            const result =
                await pool.query(
                    `UPDATE appointments
                     SET date = $1,
                         time = $2
                     WHERE id = $3
                     RETURNING *`,
                    [
                        date,
                        time,
                        appointmentId
                    ]
                );


            res.json({

                message:
                    "Appointment rescheduled successfully!",

                appointment:
                    result.rows[0]

            });


        } catch (error) {

            console.log(
                "RESCHEDULE ERROR:",
                error.message
            );

            res.status(500).json({

                message:
                    "Failed to reschedule appointment.",

                error:
                    error.message

            });

        }

    }
);


// ========================================
// CANCEL APPOINTMENT
// ========================================

app.delete(
    "/api/appointments/:id",
    async (req, res) => {

        const appointmentId =
            req.params.id;


        try {

            const result =
                await pool.query(
                    `DELETE FROM appointments
                     WHERE id = $1
                     RETURNING *`,
                    [appointmentId]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    message:
                        "Appointment not found."

                });

            }


            res.json({

                message:
                    "Appointment cancelled successfully!",

                appointment:
                    result.rows[0]

            });


        } catch (error) {

            console.log(
                "CANCEL ERROR:",
                error.message
            );

            res.status(500).json({

                message:
                    "Failed to cancel appointment.",

                error:
                    error.message

            });

        }

    }
);


// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`EverCare server running on port ${PORT}`);
});