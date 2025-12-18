import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";
import {
  sendAppointmentCreatedEmail,
  sendAppointmentCancelledEmail,
} from "../utils/mailer.js";

const router = express.Router();
console.log("✅ appointments router loaded");

router.get("/test", (req, res) => {
  res.json({ ok: true });
});

router.get("/patient", requireAuth(["patient"]), async (req, res) => {
  const patientId = Number(req.user.id);

  try {
    const result = await pool.query(
      `
      SELECT a.*, u.full_name AS doctor_name, s.name AS service_name
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.user_id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.patient_id = $1
      ORDER BY a.date, a.time
      `,
      [patientId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get(
  "/doctor/:id",
  requireAuth(["doctor", "admin"]),
  async (req, res) => {
    const doctorId = Number(req.params.id);

    try {
      const result = await pool.query(
        `
        SELECT a.*, u.full_name AS doctor_name, s.name AS service_name,
               uu.full_name AS patient_name
        FROM appointments a
        LEFT JOIN doctors d ON a.doctor_id = d.user_id
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN services s ON a.service_id = s.id
        LEFT JOIN users uu ON a.patient_id = uu.id
        WHERE a.doctor_id = $1 OR d.user_id = $1
        ORDER BY a.date, a.time
        `,
        [doctorId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

router.get("/", async (req, res) => {
  try {
    const { patient_id } = req.query;

    let query = `
      SELECT a.id, a.patient_id, a.doctor_id, a.service_id,
             a.date, a.time, a.reason, a.status,
             u.full_name AS patient_name,
             d.full_name AS doctor_name,
             s.name AS service_name,
             s.price AS service_price
      FROM appointments a
      LEFT JOIN users u ON a.patient_id = u.id
      LEFT JOIN doctors doc ON a.doctor_id = doc.user_id
      LEFT JOIN users d ON doc.user_id = d.id
      LEFT JOIN services s ON a.service_id = s.id
    `;

    const params = [];

    if (patient_id) {
      query += ` WHERE a.patient_id = $1`;
      params.push(Number(patient_id));
    }

    query += ` ORDER BY a.date DESC, a.time DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/", requireAuth(["patient"]), async (req, res) => {
  const patientId = req.user.id;
  const { doctor_id, service_id, date, time, reason } = req.body;

  try {
    const conflict = await pool.query(
      `SELECT 1 FROM appointments WHERE doctor_id = $1 AND date = $2 AND time = $3`,
      [doctor_id, date, time]
    );

    if (conflict.rows.length) {
      return res.status(409).json({ error: "Это время уже занято" });
    }

    const result = await pool.query(
      `
      INSERT INTO appointments
      (patient_id, doctor_id, service_id, date, time, reason, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
      `,
      [patientId, doctor_id, service_id, date, time, reason]
    );

    const appointment = result.rows[0];

    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [
      patientId,
    ]);
    const doctorRes = await pool.query(
      `SELECT u.* FROM doctors d LEFT JOIN users u ON d.user_id = u.id WHERE d.user_id = $1`,
      [doctor_id]
    );
    const serviceRes = await pool.query(
      `SELECT * FROM services WHERE id = $1`,
      [service_id]
    );

    sendAppointmentCreatedEmail(
      userRes.rows[0].email,
      userRes.rows[0].full_name,
      {
        date: new Date(appointment.date).toLocaleDateString("ru-RU"),
        time: appointment.time,
        doctorName: doctorRes.rows[0].full_name,
        serviceName: serviceRes.rows[0].name,
      }
    );

    req.app.locals.io.emit("appointment:created", appointment);

    res.status(201).json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновление приёма (изменение даты/времени/причины/статуса)
router.put(
  "/:id",
  requireAuth(["patient", "doctor", "admin"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user.id;
    const { date, time, reason, status } = req.body;

    try {
      const existingRes = await pool.query(
        `SELECT * FROM appointments WHERE id = $1`,
        [id]
      );

      if (!existingRes.rows.length) {
        return res.status(404).json({ error: "Приём не найден" });
      }

      const existing = existingRes.rows[0];

      if (
        (req.user.role === "patient" && existing.patient_id !== userId) ||
        (req.user.role === "doctor" && existing.doctor_id !== userId)
      ) {
        return res.status(403).json({ error: "Нет доступа" });
      }

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (date !== undefined) {
        updateFields.push(`date = $${paramIndex++}`);
        updateValues.push(date);
      }
      if (time !== undefined) {
        updateFields.push(`time = $${paramIndex++}`);
        updateValues.push(time);
      }
      if (reason !== undefined) {
        updateFields.push(`reason = $${paramIndex++}`);
        updateValues.push(reason);
      }
      if (status !== undefined && req.user.role === "admin") {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "Нет полей для обновления" });
      }

      updateValues.push(id);
      const updateQuery = `
        UPDATE appointments
        SET ${updateFields.join(", ")}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const updatedRes = await pool.query(updateQuery, updateValues);
      const updated = updatedRes.rows[0];

      req.app.locals.io.emit("appointment:updated", updated);

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

router.delete(
  "/:id",
  requireAuth(["patient", "admin", "doctor"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user.id;

    try {
      const appointmentRes = await pool.query(
        `SELECT * FROM appointments WHERE id = $1`,
        [id]
      );

      if (!appointmentRes.rows.length) {
        return res.status(404).json({ error: "Приём не найден" });
      }

      const appointment = appointmentRes.rows[0];

      if (req.user.role === "patient" && appointment.patient_id !== userId) {
        return res.status(403).json({ error: "Нет доступа" });
      }
      const updatedRes = await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *`,
        [id]
      );
      const updatedAppointment = updatedRes.rows[0];

      const doctorRes = await pool.query(
        `SELECT u.* FROM doctors d LEFT JOIN users u ON d.user_id = u.id WHERE d.user_id = $1`,
        [appointment.doctor_id]
      );
      const patientRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [
        appointment.patient_id,
      ]);

      if (doctorRes.rows.length && patientRes.rows.length) {
        sendAppointmentCancelledEmail(
          doctorRes.rows[0].email,
          doctorRes.rows[0].full_name,
          {
            date: new Date(updatedAppointment.date).toLocaleDateString("ru-RU"),
            time: updatedAppointment.time,
            patientName: patientRes.rows[0].full_name,
          }
        );
      }
      req.app.locals.io.emit("appointment:deleted", updatedAppointment);

      res.json({ ok: true, appointment: updatedAppointment });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

router.get("/admin/all", requireAuth(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT a.*, u.full_name AS doctor_name, s.name AS service_name,
             uu.full_name AS patient_name
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.user_id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN users uu ON a.patient_id = uu.id
      ORDER BY a.date DESC, a.time DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
