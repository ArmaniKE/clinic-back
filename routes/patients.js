import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Получить всех пациентов
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
