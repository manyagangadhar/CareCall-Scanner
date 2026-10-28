const $ = id => document.getElementById(id);

const STORAGE_KEY = "carecall-app-data";

let data = {
  medicines: [],
  caretaker: { name: "", phone: "" },
  checkup: { date: "", notes: "" },
  alerts: {}
};

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    data.medicines = Array.isArray(saved.medicines)
      ? saved.medicines : [];

    data.caretaker = saved.caretaker || data.caretaker;
    data.checkup = saved.checkup || data.checkup;
    data.alerts = saved.alerts || {};
  } catch (error) {
    console.error("Unable to load saved data", error);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// MEDICINE LIST
function renderMedicines() {
  const list = $("medicineList");

  if (!data.medicines.length) {
    list.innerHTML = '<p class="small">No medicines saved yet.</p>';
    return;
  }

  list.innerHTML = data.medicines.map(medicine => `
    <div class="medicine-item">
      <div>
        <h3>${escapeHTML(medicine.name)}</h3>
        <p><strong>Dose:</strong> ${escapeHTML(medicine.dose || "Not entered")}</p>
        <p><strong>Time:</strong> ${escapeHTML(medicine.time)}</p>
        <p>${escapeHTML(medicine.instructions || "")}</p>
      </div>
      <button type="button" data-delete="${escapeHTML(medicine.id)}">
        Delete
      </button>
    </div>
  `).join("");

  list.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => {
      data.medicines = data.medicines.filter(
        medicine => medicine.id !== button.dataset.delete
      );

      saveData();
      renderMedicines();
    });
  });
}

$("medicineForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("medicineName").value.trim();
  const time = $("medicineTime").value;

  if (!name || !time) {
    alert("Enter the medicine name and reminder time.");
    return;
  }

  data.medicines.push({
    id: Date.now().toString() + Math.random().toString(16).slice(2),
    name,
    dose: $("dosage").value.trim(),
    time,
    instructions: $("instructions").value.trim()
  });

  saveData();
  renderMedicines();
  $("medicineForm").reset();

  alert("Medicine saved. Please confirm that the details are correct.");
});

// VOICE REMINDERS
function speak(message) {
  if (!("speechSynthesis" in window)) {
    $("appStatus").textContent =
      "Voice reminders are not supported in this browser.";
    return;
  }

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "en-IN";
  utterance.rate = 0.9;

  speechSynthesis.speak(utterance);
}

$("voiceTestBtn").addEventListener("click", () => {
  speak("Welcome to CareCall Scanner. This is a voice reminder test.");
});

function checkReminders() {
  const now = new Date();

  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const currentTime =
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0");

  data.medicines.forEach(medicine => {
    const key = `${today}_${medicine.id}_${medicine.time}`;

    if (medicine.time === currentTime && !data.alerts[key]) {
      speak(
        `Medicine reminder. ${medicine.name}. ` +
        `${medicine.dose || ""}. ${medicine.instructions || ""}`
      );

      data.alerts[key] = true;
      saveData();
    }
  });

  if (
    data.checkup.date === today &&
    !data.alerts["checkup_" + today]
  ) {
    speak("Reminder. Your doctor checkup is scheduled for today.");
    data.alerts["checkup_" + today] = true;
    saveData();
  }
}

// PRESCRIPTION IMAGE PREVIEW
let imageURL = "";

$("prescriptionImage").addEventListener("change", event => {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    $("scanStatus").textContent = "Please choose an image file.";
    return;
  }

  if (imageURL) URL.revokeObjectURL(imageURL);

  imageURL = URL.createObjectURL(file);
  $("imagePreview").src = imageURL;
  $("imagePreview").hidden = false;

  $("scanStatus").textContent =
    "Image selected. Press Scan Prescription to extract text.";
});

// OCR SCANNING
$("scanBtn").addEventListener("click", async () => {
  const file = $("prescriptionImage").files?.[0];

  if (!file) {
    $("scanStatus").textContent = "Please select a prescription image first.";
    return;
  }

  if (!window.Tesseract) {
    $("scanStatus").textContent =
      "OCR library did not load. Check your internet connection and reload the page.";
    return;
  }

  $("scanBtn").disabled = true;
  $("scanStatus").textContent =
    "Scanning prescription. Please wait and keep this page open.";

  try {
    const result = await Tesseract.recognize(file, "eng", {
      logger: message => {
        if (message.status) {
          const progress = typeof message.progress === "number"
            ? ` ${Math.round(message.progress * 100)}%`
            : "";

          $("scanStatus").textContent =
            "Scanning: " + message.status + progress;
        }
      }
    });

    $("ocrText").value = (result.data.text || "").trim();

    $("scanStatus").textContent = $("ocrText").value
      ? "Text extracted. Check it carefully before filling the medicine form."
      : "No readable text found. Try a clearer picture or enter the text manually.";
  } catch (error) {
    console.error(error);

    $("scanStatus").textContent =
      "Scanning failed. Check your internet connection and try a clearer image.";
  } finally {
    $("scanBtn").disabled = false;
  }
});

// CONSERVATIVE FORM HELPER
$("autofillBtn").addEventListener("click", () => {
  const text = $("ocrText").value.trim();

  if (!text) {
    $("scanStatus").textContent =
      "No extracted text available. Scan an image first.";
    return;
  }

  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);

  const candidate = lines.find(line =>
    /\b(mg|mcg|ml|tablet|tab|capsule|syrup|drops)\b/i.test(line)
  );

  if (!candidate) {
    $("scanStatus").textContent =
      "Text was extracted, but a medicine line could not be identified safely. Please enter details manually.";
    return;
  }

  const strength = candidate.match(
    /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?)\b/i
  );

  let possibleName = candidate;

  if (strength) {
    $("dosage").value = strength[0];
    possibleName = possibleName.replace(strength[0], "");
  }

  $("medicineName").value = possibleName
    .replace(/[,:;()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  $("instructions").value = candidate.slice(0, 200);

  $("scanStatus").textContent =
    "Possible details filled. OCR may be wrong: verify the name, dose and instructions against the original prescription before saving.";
});

// CARETAKER
function updateContactLinks() {
  const phone = (data.caretaker.phone || "").replace(/[^\d+]/g, "");

  if (!phone) {
    $("callLink").href = "#";
    $("smsLink").href = "#";
    $("callLink").classList.add("disabled");
    $("smsLink").classList.add("disabled");
    return;
  }

  $("callLink").href = "tel:" + phone;
  $("smsLink").href =
    "sms:" + phone + "?body=" +
    encodeURIComponent($("messageText").value);

  $("callLink").classList.remove("disabled");
  $("smsLink").classList.remove("disabled");
}

$("saveCaretakerBtn").addEventListener("click", () => {
  data.caretaker = {
    name: $("caretakerName").value.trim(),
    phone: $("caretakerPhone").value.trim()
  };

  saveData();
  updateContactLinks();

  $("appStatus").textContent = "Caretaker details saved on this device.";
});

$("messageText").addEventListener("input", updateContactLinks);

// CHECKUP
$("saveCheckupBtn").addEventListener("click", () => {
  data.checkup = {
    date: $("checkupDate").value,
    notes: $("checkupNotes").value.trim()
  };

  saveData();

  $("checkupOutput").textContent = data.checkup.date
    ? `Saved checkup: ${data.checkup.date} ${data.checkup.notes}`
    : "Please select a checkup date.";
});

// LOAD SAVED DATA
function initialize() {
  loadData();

  renderMedicines();

  $("caretakerName").value = data.caretaker.name || "";
  $("caretakerPhone").value = data.caretaker.phone || "";

  $("checkupDate").value = data.checkup.date || "";
  $("checkupNotes").value = data.checkup.notes || "";

  if (data.checkup.date) {
    $("checkupOutput").textContent =
      `Saved checkup: ${data.checkup.date} ${data.checkup.notes || ""}`;
  }

  updateContactLinks();

  $("appStatus").textContent =
    "Ready. Voice reminders work while the page is running.";

  // Reminder checks occur only while the page is open.
  setInterval(checkReminders, 15000);
  checkReminders();

  // Register service worker when served from HTTPS or localhost.
  if ("serviceWorker" in navigator &&
      (location.protocol === "https:" ||
       location.hostname === "localhost" ||
       location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("CareCall service worker registered"))
      .catch(error => console.error("Service worker error:", error));
  }
}

initialize();