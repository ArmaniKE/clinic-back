import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Получить все платежи (админ)
router.get("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { patient_id } = req.query;
    const params = [];
    let where = "";

    if (patient_id) {
      where = "WHERE p.patient_id = $1";
      params.push(Number(patient_id));
    }

    const q = `
      SELECT p.id, p.patient_id, p.appointment_id, p.amount, p.status, p.method, p.paid_at, p.created_at,
             u.full_name AS patient_name,
             COALESCE(s.name, '—') AS service_name,
             a.date AS appointment_date
      FROM payments p
      LEFT JOIN users u ON p.patient_id = u.id
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN services s ON a.service_id = s.id
      ${where}
      ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
    `;

    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /payments error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Получить платежи пациента
router.get(
  "/patient/:id",
  requireAuth(["patient", "admin"]),
  async (req, res) => {
    const patientId = Number(req.params.id);
    // если пациент — проверить, что это его id
    if (req.user.role === "patient" && Number(req.user.id) !== patientId) {
      return res.status(403).json({ error: "Нет доступа" });
    }
    try {
      const result = await pool.query(
        `
      SELECT p.*, a.date AS appointment_date, s.name AS service_name
      FROM payments p
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE p.patient_id = $1
      ORDER BY p.created_at DESC
      `,
        [patientId]
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

// Получить платежи (с фильтром по пациенту)
router.get("/", async (req, res) => {
  try {
    const q = `
      SELECT p.id, p.patient_id, p.appointment_id, p.amount, p.status, p.method, p.paid_at, p.created_at,
             u.full_name AS patient_name,
             COALESCE(s.name, '—') AS service_name,
             a.date AS appointment_date
      FROM payments p
      LEFT JOIN users u ON p.patient_id = u.id
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN services s ON a.service_id = s.id
      ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
    `;
    const result = await pool.query(q);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Создать платёж
router.post("/", requireAuth(["admin"]), async (req, res) => {
  const { patient_id, appointment_id, amount, method, status } = req.body;

  if (!patient_id || !amount) {
    return res.status(400).json({ error: "patient_id и amount обязательны" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO payments (patient_id, appointment_id, amount, method, status, paid_at) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        patient_id,
        appointment_id || null,
        amount,
        method || "наличные",
        status || "pending",
        status === "completed" ? new Date() : null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить платёж
router.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const { amount, method, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE payments SET amount = $1, method = $2, status = $3, paid_at = $4 WHERE id = $5 RETURNING *`,
      [amount, method, status, status === "completed" ? new Date() : null, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ error: "Платёж не найден" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Удалить платёж
router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query(`DELETE FROM payments WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
