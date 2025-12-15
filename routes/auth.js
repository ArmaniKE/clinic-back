import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { full_name, email, password, phone, role } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }

  try {
    const existingUser = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Email уже зарегистрирован" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role`,
      [full_name, email, hashedPassword, phone || null, role || "patient"]
    );

    const user = result.rows[0];
    res.status(201).json({
      user_id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Wrong password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ user_id: user.id, role: user.role, token });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

export function requireAuth(allowedRoles) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Нет токена" });

    // safer token extraction (allow "Bearer <token>" or raw token)
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded || !decoded.role || !decoded.id) {
        return res.status(401).json({ error: "Невалидный токен" });
      }

      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: "Нет доступа" });
      }

      // normalize req.user with typed id
      req.user = { id: Number(decoded.id), role: decoded.role };

      next();
    } catch (err) {
      res.status(401).json({ error: "Невалидный токен" });
    }
  };
}

export default router;
