const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const brevoSmtpUser = defineSecret("BREVO_SMTP_USER");
const brevoSmtpKey = defineSecret("BREVO_SMTP_KEY");

const DEFAULT_TO = "scott@aesopacademy.org";
const DEFAULT_FROM = "noreply@aesopacademy.org";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPlain(submission) {
  const lines = [
    submission.subject || "25experts form submission",
    "",
    `Page: ${submission.url || submission.page || "Unknown"}`,
    "",
  ];

  for (const item of submission.readable || []) {
    lines.push(`${item.label || item.name}: ${item.value}`);
  }

  return lines.join("\n");
}

function formatHtml(submission) {
  const rows = (submission.readable || []).map(item => `
    <tr>
      <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(item.label || item.name)}</th>
      <td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(item.value)}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10231d;">
      <h2>${escapeHtml(submission.subject || "25experts form submission")}</h2>
      <p><strong>Page:</strong> ${escapeHtml(submission.url || submission.page || "Unknown")}</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px;">
        ${rows}
      </table>
    </div>
  `;
}

exports.sendFormSubmissionEmail = onDocumentCreated({
  document: "form_submissions/{submissionId}",
  secrets: [brevoSmtpUser, brevoSmtpKey],
}, async event => {
  const snapshot = event.data;
  if (!snapshot) return;

  const submission = snapshot.data();
  const to = submission.to || DEFAULT_TO;
  const from = submission.from || DEFAULT_FROM;

  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: brevoSmtpUser.value(),
      pass: brevoSmtpKey.value(),
    },
  });

  try {
    const result = await transporter.sendMail({
      to,
      from,
      replyTo: submission.fields?.email || undefined,
      subject: submission.subject || "25experts form submission",
      text: formatPlain(submission),
      html: formatHtml(submission),
    });

    await snapshot.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      messageId: result.messageId || null,
    });
  } catch (error) {
    await snapshot.ref.update({
      status: "error",
      error: error.message,
      erroredAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw error;
  }
});
