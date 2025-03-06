// ---------------------------
// Database Setup & Initialization
// ---------------------------
let db;
let currentNoteId = null;
const dbRequest = indexedDB.open("NoteTakerDB", 1);

dbRequest.onupgradeneeded = event => {
  const db = event.target.result;
  db.createObjectStore("settings", { keyPath: "key" });
  db.createObjectStore("notes", { autoIncrement: true });
  db.createObjectStore("vaultFiles", { autoIncrement: true });
};

dbRequest.onsuccess = event => {
  db = event.target.result;
  loadNotesList();
};

dbRequest.onerror = event => {
  console.error("Database error:", event.target.errorCode);
};

// ---------------------------
// Notes Functions
// ---------------------------
function loadNotesList() {
  const transaction = db.transaction(["notes"], "readonly");
  const store = transaction.objectStore("notes");
  const request = store.openCursor();
  const notesListDiv = document.getElementById("notes-list");
  notesListDiv.innerHTML = "";
  request.onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const note = cursor.value;
      const noteId = cursor.key;
      const noteElem = document.createElement("div");
      noteElem.textContent = note.title || "Untitled";
      noteElem.classList.add("note-item");
      noteElem.addEventListener("click", () => loadNote(noteId));
      notesListDiv.appendChild(noteElem);
      cursor.continue();
    }
  };
}

function loadNote(id) {
  const transaction = db.transaction(["notes"], "readonly");
  const store = transaction.objectStore("notes");
  const request = store.get(id);
  request.onsuccess = event => {
    const note = event.target.result;
    if (note) {
      document.getElementById("note-title").value = note.title || "";
      document.getElementById("note-text").value = note.content || "";
      currentNoteId = id;
    }
  };
}

document.getElementById("save-note").addEventListener("click", () => {
  const title = document.getElementById("note-title").value;
  const content = document.getElementById("note-text").value;
  const note = { title, content };
  const transaction = db.transaction(["notes"], "readwrite");
  const store = transaction.objectStore("notes");
  if (currentNoteId === null) {
    const request = store.add(note);
    request.onsuccess = event => {
      currentNoteId = event.target.result;
      loadNotesList();
    };
  } else {
    const request = store.put(note, currentNoteId);
    request.onsuccess = () => loadNotesList();
  }
});

document.getElementById("new-note").addEventListener("click", () => {
  document.getElementById("note-title").value = "";
  document.getElementById("note-text").value = "";
  currentNoteId = null;
});

document.getElementById("delete-note").addEventListener("click", () => {
  if (currentNoteId !== null) {
    const transaction = db.transaction(["notes"], "readwrite");
    const store = transaction.objectStore("notes");
    store.delete(currentNoteId);
    currentNoteId = null;
    document.getElementById("note-title").value = "";
    document.getElementById("note-text").value = "";
    loadNotesList();
  }
});

// ---------------------------
// Vault Functions & Modal Handling
// ---------------------------
function getVaultSettings(callback) {
  const transaction = db.transaction(["settings"], "readonly");
  const store = transaction.objectStore("settings");
  const request = store.get("vaultSettings");
  request.onsuccess = event => {
    callback(event.target.result);
  };
}

function saveVaultSettings(settings, callback) {
  const transaction = db.transaction(["settings"], "readwrite");
  const store = transaction.objectStore("settings");
  store.put({ key: "vaultSettings", ...settings });
  transaction.oncomplete = () => {
    if (callback) callback();
  };
}

function showVault() {
  document.getElementById("vault-section").classList.remove("hidden");
  loadVaultFiles();
}

document.getElementById("lock-vault").addEventListener("click", () => {
  document.getElementById("vault-section").classList.add("hidden");
});

// Load vault files and display as thumbnails with file options
function loadVaultFiles() {
  const transaction = db.transaction(["vaultFiles"], "readonly");
  const store = transaction.objectStore("vaultFiles");
  const request = store.openCursor();
  const fileListDiv = document.getElementById("file-list");
  fileListDiv.innerHTML = "";
  request.onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      const file = cursor.value;
      const fileId = cursor.key;
      const thumbElem = document.createElement("div");
      thumbElem.classList.add("file-item");
      const fileURL = URL.createObjectURL(file.data);
      if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = fileURL;
        thumbElem.appendChild(img);
      } else if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.src = fileURL;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        thumbElem.appendChild(video);
      } else if (file.type === "application/pdf") {
        const pdfDiv = document.createElement("div");
        pdfDiv.textContent = "PDF";
        pdfDiv.style.fontSize = "18px";
        pdfDiv.style.fontWeight = "bold";
        thumbElem.appendChild(pdfDiv);
      } else {
        const fileDiv = document.createElement("div");
        fileDiv.textContent = file.filename;
        thumbElem.appendChild(fileDiv);
      }
      // File options overlay (delete and rename)
      const optionsDiv = document.createElement("div");
      optionsDiv.classList.add("file-options");
      
      // Delete Icon
      const deleteIcon = document.createElement("i");
      deleteIcon.className = "fas fa-trash-alt";
      deleteIcon.addEventListener("click", e => {
        e.stopPropagation();
        if (confirm("Delete this file?")) {
          deleteFile(fileId);
        }
      });
      optionsDiv.appendChild(deleteIcon);
      
      // Rename Icon
      const renameIcon = document.createElement("i");
      renameIcon.className = "fas fa-edit";
      renameIcon.addEventListener("click", e => {
        e.stopPropagation();
        renameFile(fileId, file);
      });
      optionsDiv.appendChild(renameIcon);
      
      thumbElem.appendChild(optionsDiv);
      
      // Clicking thumbnail opens file preview
      thumbElem.addEventListener("click", () => openFilePreview(file));
      fileListDiv.appendChild(thumbElem);
      cursor.continue();
    }
  };
}

// Delete file from the database
function deleteFile(fileId) {
  const transaction = db.transaction(["vaultFiles"], "readwrite");
  const store = transaction.objectStore("vaultFiles");
  const request = store.delete(fileId);
  request.onsuccess = () => {
    loadVaultFiles();
  };
}

// Rename file: prompt for new name and update record
function renameFile(fileId, file) {
  const newName = prompt("Enter new name for the file:", file.filename);
  if (newName && newName.trim() !== "") {
    const transaction = db.transaction(["vaultFiles"], "readwrite");
    const store = transaction.objectStore("vaultFiles");
    file.filename = newName.trim();
    const request = store.put(file, fileId);
    request.onsuccess = () => loadVaultFiles();
  }
}

/* 
  Updated File Upload Process:
  - Clicking the "upload-button" now triggers a click on the hidden file input.
  - The file input's change event automatically uploads the selected files.
*/
document.getElementById("upload-button").addEventListener("click", () => {
  document.getElementById("file-upload").click();
});

document.getElementById("file-upload").addEventListener("change", function() {
  const files = this.files;
  if (files.length > 0) {
    const transaction = db.transaction(["vaultFiles"], "readwrite");
    const store = transaction.objectStore("vaultFiles");
    Array.from(files).forEach(file => {
      const fileObj = {
        filename: file.name,
        type: file.type,
        data: file
      };
      store.add(fileObj);
    });
    transaction.oncomplete = () => {
      loadVaultFiles();
      this.value = ""; // Clear input for future uploads
    };
  }
});

// Open file preview in modal
function openFilePreview(file) {
  const modal = document.getElementById("file-preview-modal");
  const contentDiv = document.getElementById("file-preview-content");
  contentDiv.innerHTML = "";
  const fileURL = URL.createObjectURL(file.data);
  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = fileURL;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "80vh";
    contentDiv.appendChild(img);
  } else if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = fileURL;
    video.controls = true;
    video.style.maxWidth = "100%";
    video.style.maxHeight = "80vh";
    contentDiv.appendChild(video);
  } else if (file.type === "application/pdf") {
    const embed = document.createElement("embed");
    embed.src = fileURL;
    embed.type = "application/pdf";
    embed.style.width = "100%";
    embed.style.height = "80vh";
    contentDiv.appendChild(embed);
  } else {
    const a = document.createElement("a");
    a.href = fileURL;
    a.download = file.filename;
    a.textContent = "Download " + file.filename;
    contentDiv.appendChild(a);
  }
  modal.classList.remove("hidden");
}

document.getElementById("close-file-preview").addEventListener("click", () => {
  document.getElementById("file-preview-modal").classList.add("hidden");
});

// ---------------------------
// Vault Password Modal Logic
// ---------------------------
const passwordModal = document.getElementById("password-modal");
const recoveryModal = document.getElementById("recovery-modal");

function openVaultModal() {
  getVaultSettings(settings => {
    if (settings) {
      setVaultModalMode("login");
    } else {
      setVaultModalMode("setup");
    }
  });
  passwordModal.classList.remove("hidden");
}

function setVaultModalMode(mode) {
  document.getElementById("password-input").value = "";
  document.getElementById("confirm-password-input").value = "";
  document.getElementById("recovery-question-input").value = "";
  document.getElementById("recovery-answer-input").value = "";
  
  if (mode === "login") {
    document.getElementById("password-modal-title").textContent = "Enter Vault Password";
    document.getElementById("password-label").textContent = "Password";
    document.getElementById("confirm-password-group").classList.add("hidden");
    document.getElementById("recovery-question-group").classList.add("hidden");
    document.getElementById("recovery-answer-group").classList.add("hidden");
  } else if (mode === "setup") {
    document.getElementById("password-modal-title").textContent = "Set Vault Password";
    document.getElementById("password-label").textContent = "Password";
    document.getElementById("confirm-password-group").classList.remove("hidden");
    document.getElementById("recovery-question-group").classList.remove("hidden");
    document.getElementById("recovery-answer-group").classList.remove("hidden");
  }
  passwordModal.dataset.mode = mode;
}

document.getElementById("submit-password-btn").addEventListener("click", () => {
  const mode = passwordModal.dataset.mode;
  const password = document.getElementById("password-input").value.trim();
  if (!password) {
    alert("Please enter a password.");
    return;
  }
  if (mode === "login") {
    getVaultSettings(settings => {
      const hashedInput = CryptoJS.SHA256(password).toString();
      if (hashedInput === settings.password) {
        passwordModal.classList.add("hidden");
        showVault();
      } else {
        alert("Incorrect password");
      }
    });
  } else if (mode === "setup") {
    const confirmPassword = document.getElementById("confirm-password-input").value.trim();
    const recoveryQuestion = document.getElementById("recovery-question-input").value.trim();
    const recoveryAnswer = document.getElementById("recovery-answer-input").value.trim();
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    if (!recoveryQuestion || !recoveryAnswer) {
      alert("Please fill out the recovery question and answer.");
      return;
    }
    const hashedPassword = CryptoJS.SHA256(password).toString();
    const hashedRecoveryAnswer = CryptoJS.SHA256(recoveryAnswer).toString();
    saveVaultSettings({
      password: hashedPassword,
      recoveryQuestion: recoveryQuestion,
      recoveryAnswer: hashedRecoveryAnswer
    }, () => {
      passwordModal.classList.add("hidden");
      showVault();
    });
  }
});

document.getElementById("cancel-password-btn").addEventListener("click", () => {
  passwordModal.classList.add("hidden");
});

// ---------------------------
// Forgot Password / Recovery Flow
// ---------------------------
document.getElementById("forgot-password-btn").addEventListener("click", () => {
  passwordModal.classList.add("hidden");
  getVaultSettings(settings => {
    if (settings) {
      document.getElementById("recovery-question-display").textContent = settings.recoveryQuestion;
      document.getElementById("recovery-answer-check").value = "";
      document.getElementById("new-password-input").value = "";
      document.getElementById("confirm-new-password-input").value = "";
      document.getElementById("new-password-group").classList.add("hidden");
      document.getElementById("confirm-new-password-group").classList.add("hidden");
      document.getElementById("reset-password-btn").classList.add("hidden");
      recoveryModal.classList.remove("hidden");
    }
  });
});

document.getElementById("cancel-recovery-btn").addEventListener("click", () => {
  recoveryModal.classList.add("hidden");
});

document.getElementById("check-answer-btn").addEventListener("click", () => {
  const recoveryAnswer = document.getElementById("recovery-answer-check").value.trim();
  if (!recoveryAnswer) {
    alert("Please enter your recovery answer.");
    return;
  }
  getVaultSettings(settings => {
    const hashedAnswer = CryptoJS.SHA256(recoveryAnswer).toString();
    if (hashedAnswer === settings.recoveryAnswer) {
      document.getElementById("new-password-group").classList.remove("hidden");
      document.getElementById("confirm-new-password-group").classList.remove("hidden");
      document.getElementById("reset-password-btn").classList.remove("hidden");
    } else {
      alert("Incorrect recovery answer.");
    }
  });
});

document.getElementById("reset-password-btn").addEventListener("click", () => {
  const newPassword = document.getElementById("new-password-input").value.trim();
  const confirmNewPassword = document.getElementById("confirm-new-password-input").value.trim();
  if (!newPassword) {
    alert("Please enter a new password.");
    return;
  }
  if (newPassword !== confirmNewPassword) {
    alert("New passwords do not match!");
    return;
  }
  const hashedNewPassword = CryptoJS.SHA256(newPassword).toString();
  getVaultSettings(settings => {
    saveVaultSettings({
      password: hashedNewPassword,
      recoveryQuestion: settings.recoveryQuestion,
      recoveryAnswer: settings.recoveryAnswer
    }, () => {
      alert("Vault password has been reset.");
      recoveryModal.classList.add("hidden");
    });
  });
});

// ---------------------------
// Change Password Flow (Prompt-Based)
// ---------------------------
document.getElementById("change-password").addEventListener("click", () => {
  getVaultSettings(settings => {
    const currentPassword = prompt("Enter your current vault password:");
    if (!currentPassword) return;
    const hashedCurrent = CryptoJS.SHA256(currentPassword).toString();
    if (hashedCurrent !== settings.password) {
      alert("Incorrect current password.");
      return;
    }
    const newPassword = prompt("Enter your new vault password:");
    if (!newPassword) return;
    const confirmNew = prompt("Confirm your new vault password:");
    if (newPassword !== confirmNew) {
      alert("Passwords do not match!");
      return;
    }
    const hashedNew = CryptoJS.SHA256(newPassword).toString();
    saveVaultSettings({
      password: hashedNew,
      recoveryQuestion: settings.recoveryQuestion,
      recoveryAnswer: settings.recoveryAnswer
    }, () => {
      alert("Vault password successfully changed.");
    });
  });
});

// ---------------------------
// Secret Operation: Unlock Vault
// ---------------------------
// Desktop: Triple press "v"
let secretKeyBuffer = [];
const secretKeySequence = ["v", "v", "v"];
const secretTimeout = 1000;
document.addEventListener("keydown", e => {
  secretKeyBuffer.push(e.key.toLowerCase());
  if (secretKeyBuffer.length > secretKeySequence.length) {
    secretKeyBuffer.shift();
  }
  if (secretKeyBuffer.join("") === secretKeySequence.join("")) {
    openVaultModal();
    secretKeyBuffer = [];
  }
  setTimeout(() => { secretKeyBuffer = []; }, secretTimeout);
});

// Mobile: Triple-tap on the header brand element
let tapCount = 0;
let tapTimeout = null;
document.querySelector(".brand").addEventListener("touchend", function() {
  tapCount++;
  if (tapCount === 1) {
    tapTimeout = setTimeout(() => {
      tapCount = 0;
    }, 800);
  }
  if (tapCount === 3) {
    clearTimeout(tapTimeout);
    tapCount = 0;
    openVaultModal();
  }
});

// ---------------------------
// Dark Mode Toggle
// ---------------------------
document.getElementById("dark-mode-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});
