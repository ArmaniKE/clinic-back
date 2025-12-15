import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendAppointmentCreatedEmail(
  patientEmail,
  patientName,
  appointmentDetails
) {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: patientEmail,
      subject: "Подтверждение записи на приём",
      html: `
        <h2>Привет, ${patientName}!</h2>
        <p>Вы успешно записались на приём.</p>
        <p><strong>Дата:</strong> ${appointmentDetails.date}</p>
        <p><strong>Время:</strong> ${appointmentDetails.time}</p>
        <p><strong>Врач:</strong> ${appointmentDetails.doctorName}</p>
        <p><strong>Услуга:</strong> ${appointmentDetails.serviceName}</p>
        <p>Спасибо за запись!</p>
      `,
    });
    console.log(`Email sent to ${patientEmail}`);
  } catch (err) {
    console.error("Email send error:", err);
  }
}

export async function sendAppointmentCancelledEmail(
  doctorEmail,
  doctorName,
  appointmentDetails
) {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: doctorEmail,
      subject: "Приём отменён",
      html: `
        <h2>Привет, ${doctorName}!</h2>
        <p>Приём был отменён пациентом.</p>
        <p><strong>Дата:</strong> ${appointmentDetails.date}</p>
        <p><strong>Время:</strong> ${appointmentDetails.time}</p>
        <p><strong>Пациент:</strong> ${appointmentDetails.patientName}</p>
        <p>Спасибо.</p>
      `,
    });
    console.log(`Email sent to ${doctorEmail}`);
  } catch (err) {
    console.error("Email send error:", err);
  }
}
