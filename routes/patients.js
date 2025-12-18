import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Получить всех пациентов (админ / общий список)
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT p.id, p.user_id, u.full_name, u.email, u.phone, p.birth_date, p.address
      FROM patients p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE u.role = 'patient'
      ORDER BY u.full_name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Получить пациентов конкретного врача
router.get(
  "/doctor/:id",
  requireAuth(["doctor", "admin"]),
  async (req, res) => {
    const doctorId = Number(req.params.id);

    try {
      const result = await pool.query(
        `
      SELECT DISTINCT
        u.id AS user_id,
        u.full_name,
        u.email,
        u.phone,
        p.birth_date,
        p.address
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      LEFT JOIN patients p ON p.user_id = u.id
      WHERE a.doctor_id = $1
      ORDER BY u.full_name
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

// Создать пациента
router.post("/", requireAuth(["admin"]), async (req, res) => {
  const { user_id, birth_date, address } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO patients (user_id, birth_date, address) VALUES ($1, $2, $3) RETURNING *`,
      [user_id, birth_date || null, address || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Данные текущего пациента (для личного кабинета)
router.get("/me", requireAuth(["patient"]), async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `
      SELECT 
        u.id AS user_id,
        u.full_name,
        u.email,
        u.phone,
        p.birth_date,
        p.address
      FROM users u
      LEFT JOIN patients p ON p.user_id = u.id
      WHERE u.id = $1 AND u.role = 'patient'
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Пациент не найден" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить пациента
router.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const { birth_date, address } = req.body;
  try {
    const result = await pool.query(
      `UPDATE patients SET birth_date = $1, address = $2 WHERE user_id = $3 RETURNING *`,
      [birth_date, address, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ error: "Пациент не найден" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить профиль текущего пациента (личный кабинет)
router.put("/me", requireAuth(["patient"]), async (req, res) => {
  const userId = req.user.id;
  const { full_name, phone, birth_date, address } = req.body;

  try {
    // Обновляем таблицу users
    const userRes = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone)
       WHERE id = $3
       RETURNING id AS user_id, full_name, email, phone`,
      [full_name || null, phone || null, userId]
    );

    if (!userRes.rows.length) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    // Пытаемся обновить запись в patients
    const patientUpdate = await pool.query(
      `UPDATE patients 
       SET birth_date = $1, address = $2 
       WHERE user_id = $3`,
      [birth_date || null, address || null, userId]
    );

    // Если записи не было — создаём
    if (patientUpdate.rowCount === 0) {
      await pool.query(
        `INSERT INTO patients (user_id, birth_date, address) VALUES ($1, $2, $3)`,
        [userId, birth_date || null, address || null]
      );
    }

    const patientRes = await pool.query(
      `SELECT birth_date, address FROM patients WHERE user_id = $1`,
      [userId]
    );

    const user = userRes.rows[0];
    const patient = patientRes.rows[0] || { birth_date: null, address: null };

    res.json({ ...user, ...patient });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Удалить пациента
router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query(`DELETE FROM appointments WHERE patient_id = $1`, [id]);
    await pool.query(`DELETE FROM patients WHERE user_id = $1`, [id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
