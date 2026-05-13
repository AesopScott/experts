import { db } from "./firebase-init.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DEFAULT_TO = "scott@aesopacademy.org";
const DEFAULT_FROM = "noreply@aesopacademy.org";

function fieldLabel(field) {
  const label = field.closest("label");
  if (label) {
    const clone = label.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button").forEach(el => el.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }
  return field.name || field.id || "Field";
}

function formPayload(form) {
  const data = new FormData(form);
  const fields = {};

  for (const [key, value] of data.entries()) {
    if (key.startsWith("form_")) continue;
    if (fields[key]) {
      fields[key] = Array.isArray(fields[key]) ? [...fields[key], value] : [fields[key], value];
    } else {
      fields[key] = value;
    }
  }

  const readable = Array.from(form.elements)
    .filter(field => field.name && !field.name.startsWith("form_"))
    .filter(field => {
      if (field.type === "checkbox" || field.type === "radio") return field.checked;
      return field.type !== "button" && field.type !== "submit" && field.type !== "reset";
    })
    .map(field => ({ label: fieldLabel(field), name: field.name, value: data.getAll(field.name).join(", ") }))
    .filter(item => item.value.trim() !== "");

  return { fields, readable };
}

async function sendFormEmail(form) {
  if (form.dataset.emailSubmitting === "true") return;
  form.dataset.emailSubmitting = "true";

  const { fields, readable } = formPayload(form);

  try {
    await addDoc(collection(db, "form_submissions"), {
      to: form.dataset.recipientEmail || DEFAULT_TO,
      from: form.dataset.fromEmail || DEFAULT_FROM,
      subject: fields.form_subject || form.querySelector("[name='form_subject']")?.value || "25experts form submission",
      page: window.location.pathname,
      url: window.location.href,
      formId: form.id || null,
      fields,
      readable,
      status: "queued",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Form email queue failed", error);
  } finally {
    delete form.dataset.emailSubmitting;
  }
}

document.addEventListener("submit", event => {
  const form = event.target.closest("form[data-recipient-email]");
  if (!form) return;
  sendFormEmail(form);
}, true);
