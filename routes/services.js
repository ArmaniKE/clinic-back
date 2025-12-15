import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Получить все услуги
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM services ORDER BY name`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Создать услугу
router.post("/", requireAuth(["admin"]), async (req, res) => {
  const { name, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Название и цена обязательны" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO services (name, price) VALUES ($1, $2) RETURNING *`,
      [name, Number(price)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Обновить услугу
router.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const { name, price } = req.body;

  try {
    const result = await pool.query(
      `UPDATE services SET name = $1, price = $2 WHERE id = $3 RETURNING *`,
      [name, Number(price), id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ error: "Услуга не найдена" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Удалить услугу
router.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  try {
    // Проверить есть ли приёмы с этой услугой
    const appointments = await pool.query(
      `SELECT * FROM appointments WHERE service_id = $1`,
      [id]
    );
    if (appointments.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "Нельзя удалить услугу, есть приёмы с ней" });
    }

    await pool.query(`DELETE FROM services WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
