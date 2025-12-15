import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";
import bcrypt from "bcrypt";

const router = express.Router();

// Получить всех врачей
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.user_id, u.full_name, u.email, u.phone, d.specialization, d.room 
       FROM doctors d 
       LEFT JOIN users u ON d.user_id = u.id 
       ORDER BY u.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  const doctorId = req.params.id;
  try {
    const result = await pool.query(
      `
      SELECT d.id, u.full_name, u.email, u.phone, d.specialization, d.room, d.notes
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = $1
    `,
      [doctorId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Doctor not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создать врача
router.post("/", requireAuth(["admin"]), async (req, res) => {
  const { user_id, specialization, room } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: "user_id обязателен" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO doctors (user_id, specialization, room) VALUES ($1, $2, $3) RETURNING *`,
      [user_id, specialization, room]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить врача
router.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const { specialization, room } = req.body;

  try {
    const result = await pool.query(
      `UPDATE doctors SET specialization = $1, room = $2 WHERE user_id = $3 RETURNING *`,
      [specialization, room, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ error: "Врач не найден" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query(`DELETE FROM appointments WHERE doctor_id = $1`, [id]);
    const result = await pool.query(`DELETE FROM doctors WHERE user_id = $1`, [
      id,
    ]);
    if (result.rowCount === 0)
      return res.status(404).json({ error: "Врач не найден" });
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
