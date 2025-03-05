// Initialize IndexedDB
let db;
const request = indexedDB.open("notesApp", 1);
request.onupgradeneeded = (event) => {
    db = event.target.result;
    db.createObjectStore("notes", { autoIncrement: true });
    db.createObjectStore("vault", { autoIncrement: true });
    db.createObjectStore("settings");
};
request.onsuccess = (event) => {
    db = event.target.result;
    loadNotesList();
};

// Notes Functionality
let currentNoteId = null;
let saveTimeout = null;

document.getElementById("noteEditor").addEventListener("input", () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentNote, 1000);
});

async function saveCurrentNote() {
    const content = document.getElementById("noteEditor").value;
    const transaction = db.transaction(["notes"], "readwrite");
    const notesStore = transaction.objectStore("notes");
    if (currentNoteId) {
        notesStore.put(content, currentNoteId);
    } else {
        const addRequest = notesStore.add(content);
        addRequest.onsuccess = () => {
            currentNoteId = addRequest.result;
            loadNotesList();
        };
    }
}

function loadNotesList() {
    const notesList = document.getElementById("notesList");
    notesList.innerHTML = "";
    const transaction = db.transaction(["notes"], "readonly");
    const notesStore = transaction.objectStore("notes");
    const cursorRequest = notesStore.openCursor();
    cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const li = document.createElement("li");
            li.textContent = cursor.value.substring(0, 20) + "...";
            li.className = "p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded";
            li.onclick = () => {
                currentNoteId = cursor.key;
                document.getElementById("noteEditor").value = cursor.value;
            };
            notesList.appendChild(li);
            cursor.continue();
        }
    };
}

// Search Functionality
document.getElementById("search").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        const query = e.target.value.trim().toLowerCase();
        if (query === "secret files") {
            showPasswordModal();
        } else {
            searchNotes(query);
        }
    }
});

function searchNotes(query) {
    const notesList = document.getElementById("notesList");
    notesList.innerHTML = "";
    const transaction = db.transaction(["notes"], "readonly");
    const notesStore = transaction.objectStore("notes");
    const cursorRequest = notesStore.openCursor();
    cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            if (cursor.value.toLowerCase().includes(query.toLowerCase())) {
                const li = document.createElement("li");
                li.textContent = cursor.value.substring(0, 20) + "...";
                li.className = "p-2 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded";
                li.onclick = () => {
                    currentNoteId = cursor.key;
                    document.getElementById("noteEditor").value = cursor.value;
                };
                notesList.appendChild(li);
            }
            cursor.continue();
        }
    };
}

// Vault Functionality
let isSetupMode = false;
let vaultKey = null;

function showPasswordModal() {
    const transaction = db.transaction(["settings"], "readonly");
    const settingsStore = transaction.objectStore("settings");
    const getRequest = settingsStore.get("verification");
    getRequest.onsuccess = () => {
        if (getRequest.result) {
            isSetupMode = false;
            document.getElementById("passwordTitle").textContent = "Enter Password";
        } else {
            isSetupMode = true;
            document.getElementById("passwordTitle").textContent = "Set Password";
        }
        document.getElementById("passwordModal").classList.remove("hidden");
    };
}

document.getElementById("submitPassword").addEventListener("click", async () => {
    const password = document.getElementById("passwordInput").value;
    if (isSetupMode) {
        await setupVault(password);
        showVault();
    } else {
        const isCorrect = await verifyPassword(password);
        if (isCorrect) {
            showVault();
        } else {
            alert("Incorrect password");
        }
    }
});

async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function setupVault(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedToken = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("vault_access"));
    const transaction = db.transaction(["settings"], "readwrite");
    const settingsStore = transaction.objectStore("settings");
    settingsStore.put(salt, "salt");
    settingsStore.put(iv, "tokenIV");
    settingsStore.put(encryptedToken, "verification");
    await new Promise((resolve) => (transaction.oncomplete = resolve));
    vaultKey = key;
}

async function verifyPassword(password) {
    const salt = await getSettings("salt");
    const key = await deriveKey(password, salt);
    const tokenIV = await getSettings("tokenIV");
    const encryptedToken = await getSettings("verification");
    try {
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: tokenIV }, key, encryptedToken);
        const token = new TextDecoder().decode(decrypted);
        if (token === "vault_access") {
            vaultKey = key;
            return true;
        }
    } catch {
        return false;
    }
    return false;
}

async function getSettings(key) {
    const transaction = db.transaction(["settings"], "readonly");
    const store = transaction.objectStore("settings");
    const request = store.get(key);
    return new Promise((resolve) => (request.onsuccess = () => resolve(request.result)));
}

async function showVault() {
    document.getElementById("passwordModal").classList.add("hidden");
    document.getElementById("vaultModal").classList.remove("hidden");
    const vaultContent = document.getElementById("vaultContent");
    vaultContent.innerHTML = "";
    const transaction = db.transaction(["vault"], "readonly");
    const vaultStore = transaction.objectStore("vault");
    const files = [];
    const cursorRequest = vaultStore.openCursor();
    cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            files.push({ id: cursor.key, ...cursor.value });
            cursor.continue();
        } else {
            files.forEach(async (file) => {
                const decryptedData = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: file.iv },
                    vaultKey,
                    file.data
                );
                const blob = new Blob([decryptedData], { type: file.type });
                const url = URL.createObjectURL(blob);
                const div = document.createElement("div");
                div.className = "bg-gray-200 dark:bg-gray-700 p-2 rounded shadow hover:shadow-md transition";
                if (file.type.startsWith("image/")) {
                    div.innerHTML = `<img src="${url}" class="w-full h-32 object-cover rounded" alt="${file.name}">`;
                } else if (file.type.startsWith("video/")) {
                    div.innerHTML = `<div class="w-full h-32 flex items-center justify-center bg-gray-300 dark:bg-gray-600 rounded"><span class="text-gray-600 dark:text-gray-300">Video: ${file.name}</span></div>`;
                } else {
                    div.innerHTML = `<div class="w-full h-32 flex items-center justify-center bg-gray-300 dark:bg-gray-600 rounded"><span class="text-gray-600 dark:text-gray-300">Doc: ${file.name}</span></div>`;
                }
                div.innerHTML += `<p class="text-center mt-2 text-sm truncate text-gray-700 dark:text-gray-300">${file.name}</p>`;
                vaultContent.appendChild(div);
            });
        }
    };
}

document.getElementById("uploadButton").addEventListener("click", async () => {
    const fileInput = document.getElementById("fileUpload");
    const files = fileInput.files;
    if (files.length === 0) return;

    const transaction = db.transaction(["vault"], "readwrite");
    const vaultStore = transaction.objectStore("vault");

    const uploadPromises = Array.from(files).map(async (file) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await file.arrayBuffer();
        const encryptedData = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            vaultKey,
            data
        );
        return vaultStore.add({ name: file.name, type: file.type, iv, data: encryptedData });
    });

    await Promise.all(uploadPromises);
    await new Promise((resolve) => (transaction.oncomplete = resolve));
    showVault(); // Refresh vault display after upload
});

document.getElementById("closeVault").addEventListener("click", () => {
    document.getElementById("vaultModal").classList.add("hidden");
    vaultKey = null;
});

// Dark Mode Toggle
document.getElementById("darkModeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const icon = document.getElementById("darkModeIcon");
    if (document.body.classList.contains("dark")) {
        icon.setAttribute("d", "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z");
    } else {
        icon.setAttribute("d", "M20.354 15.354A9 9 0 018.646 3.646 9 9 0 0012 21a9 9 0 008.354-5.646z");
    }
});