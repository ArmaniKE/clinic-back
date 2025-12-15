import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";
import {
  sendAppointmentCreatedEmail,
  sendAppointmentCancelledEmail,
} from "../utils/mailer.js";
import { io } from "../app.js";

const router = express.Router();
console.log("✅ appointments router loaded");

// тестовый роут (оставляем)
router.get("/test", (req, res) => {
  res.json({ ok: true });
});

// Получить приёмы пациента
router.get("/patient", requireAuth(["patient"]), async (req, res) => {
  const patientId = Number(req.user?.id);
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

// Получить приёмы врача
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

// Получить приёмы (с фильтром по пациенту)
router.get("/", async (req, res) => {
  try {
    const { patient_id } = req.query;

    let query = `
      SELECT a.id, a.patient_id, a.doctor_id, a.service_id, a.date, a.time, a.reason, a.status,
             u.full_name as patient_name, d.full_name as doctor_name, s.name as service_name, s.price as service_price
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

// POST создать приём
router.post("/", requireAuth(["patient"]), async (req, res) => {
  const patientId = req.user.id;
  const { doctor_id, service_id, date, time, reason } = req.body;

  try {
    // Проверить конфликт времени
    const conflict = await pool.query(
      `SELECT * FROM appointments WHERE doctor_id = $1 AND date = $2 AND time = $3`,
      [doctor_id, date, time]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: "Это время уже занято" });
    }

    const result = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, service_id, date, time, reason, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [patientId, doctor_id, service_id, date, time, reason]
    );

    const appointment = result.rows[0];

    // Получить данные для email
    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [
      patientId,
    ]);
    const doctorRes = await pool.query(
      `SELECT u.*, d.* FROM doctors d LEFT JOIN users u ON d.user_id = u.id WHERE d.user_id = $1`,
      [doctor_id]
    );
    const serviceRes = await pool.query(
      `SELECT * FROM services WHERE id = $1`,
      [service_id]
    );

    const patientEmail = userRes.rows[0].email;
    const patientName = userRes.rows[0].full_name;
    const doctorEmail = doctorRes.rows[0].email;
    const doctorName = doctorRes.rows[0].full_name;
    const serviceName = serviceRes.rows[0].name;

    // Отправить email пациенту
    sendAppointmentCreatedEmail(patientEmail, patientName, {
      date: new Date(appointment.date).toLocaleDateString("ru-RU"),
      time: appointment.time,
      doctorName,
      serviceName,
    });

    // Emit socket event
    io.emit("appointment:created", appointment);

    res.status(201).json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить приём (врач/админ могут менять, пациент — только отменять через DELETE)
router.put(
  "/:id",
  requireAuth(["patient", "doctor", "admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { date, time, reason } = req.body;
    const userId = req.user.id;

    try {
      const appointment = await pool.query(
        "SELECT * FROM appointments WHERE id = $1",
        [id]
      );

      if (appointment.rowCount === 0) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      const apt = appointment.rows[0];

      if (req.user.role === "patient" && apt.patient_id !== userId) {
        return res
          .status(403)
          .json({ error: "You can only edit your own appointments" });
      }

      const updated = await pool.query(
        `UPDATE appointments SET date = $1, time = $2, reason = $3 
       WHERE id = $4 RETURNING *`,
        [date || apt.date, time || apt.time, reason || apt.reason, id]
      );

      res.json(updated.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

// DELETE отменить приём
router.delete("/:id", requireAuth(["patient", "admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.user.id;

  try {
    const appointmentRes = await pool.query(
      `SELECT * FROM appointments WHERE id = $1`,
      [id]
    );
    if (appointmentRes.rows.length === 0)
      return res.status(404).json({ error: "Приём не найден" });

    const appointment = appointmentRes.rows[0];

    // Проверить доступ (пациент может удалять только свои)
    if (req.user.role === "patient" && appointment.patient_id !== userId) {
      return res.status(403).json({ error: "Нет доступа" });
    }

    await pool.query(`DELETE FROM appointments WHERE id = $1`, [id]);

    // Получить данные для email врачу
    const doctorRes = await pool.query(
      `SELECT u.*, d.* FROM doctors d LEFT JOIN users u ON d.user_id = u.id WHERE d.user_id = $1`,
      [appointment.doctor_id]
    );
    const patientRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [
      appointment.patient_id,
    ]);

    if (doctorRes.rows.length > 0 && patientRes.rows.length > 0) {
      const doctorEmail = doctorRes.rows[0].email;
      const doctorName = doctorRes.rows[0].full_name;
      const patientName = patientRes.rows[0].full_name;

      // Отправить email врачу
      sendAppointmentCancelledEmail(doctorEmail, doctorName, {
        date: new Date(appointment.date).toLocaleDateString("ru-RU"),
        time: appointment.time,
        patientName,
      });
    }

    // Emit socket event
    io.emit("appointment:deleted", appointment);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Получить все приёмы (админ)
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
