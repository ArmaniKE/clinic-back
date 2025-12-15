import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Получить всех пользователей (админ)
router.get("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role FROM users ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить пользователя
router.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, email, phone } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET full_name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING id, full_name, email, role`,
      [full_name, email, phone, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ error: "Пользователь не найден" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
