import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Получить статистику для админа
router.get("/admin", requireAuth(["admin"]), async (req, res) => {
  try {
    const totalRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'`
    );
    const total = totalRes.rows[0].total;
    const weekRes = await pool.query(
      `
      SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount
      FROM payments
      WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      `
    );
    const weekData = weekRes.rows;

    const doctorsRes = await pool.query(
      `
      SELECT u.full_name, COALESCE(SUM(p.amount), 0) as total
      FROM payments p
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN doctors d ON a.doctor_id = d.user_id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE p.status = 'completed'
      GROUP BY u.id, u.full_name
      ORDER BY total DESC
      `
    );
    const doctorStats = doctorsRes.rows;

    const appointmentsRes = await pool.query(
      `SELECT COUNT(*) as total FROM appointments`
    );
    const appointmentCount = appointmentsRes.rows[0].total;

    const patientsRes = await pool.query(
      `SELECT COUNT(*) as total FROM patients`
    );
    const patientCount = patientsRes.rows[0].total;

    const doctorsCountRes = await pool.query(
      `SELECT COUNT(*) as total FROM doctors`
    );
    const doctorCount = doctorsCountRes.rows[0].total;

    res.json({
      total,
      weekData,
      doctorStats,
      appointmentCount,
      patientCount,
      doctorCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
