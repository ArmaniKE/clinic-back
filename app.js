import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import patientRoutes from "./routes/patients.js";
import doctorRoutes from "./routes/doctors.js";
import appointmentRoutes from "./routes/appointments.js";
import serviceRoutes from "./routes/services.js";
import paymentRoutes from "./routes/payments.js";
import dashboardRouter from "./routes/dashboard.js";
import usersRouter from "./routes/users.js";

dotenv.config();

const app = express();

const FRONTEND_URLS = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: FRONTEND_URLS,
    credentials: true,
  })
);

app.use(express.json());

app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/doctors", doctorRoutes);
app.use("/appointments", appointmentRoutes);
app.use("/services", serviceRoutes);
app.use("/payments", paymentRoutes);
app.use("/dashboard", dashboardRouter);
app.use("/users", usersRouter);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URLS,
    credentials: true,
  },
});

app.locals.io = io;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
