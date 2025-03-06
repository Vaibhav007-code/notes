// app.js
const SECRET_CLICK_SEQUENCE = [3, 2, 1]; // Click the header lock icon 3 times
let clickCount = [];
let db;
let currentFiles = [];
let currentMediaIndex = 0;
let currentNoteId = null;
const DB_NAME = 'FileVaultDB';
const STORE_NAME = 'files';
const NOTES_STORE = 'notes';

// Initialize database
function initDB() {
    const request = indexedDB.open(DB_NAME, 2);

    request.onupgradeneeded = function(e) {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
            const notesStore = db.createObjectStore(NOTES_STORE, { keyPath: 'id', autoIncrement: true });
            notesStore.createIndex('title', 'title', { unique: false });
            notesStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
    };

    request.onsuccess = function(e) {
        db = e.target.result;
        loadTheme();
        loadNotesList();
    };

    request.onerror = function(e) {
        console.error('IndexedDB error:', e.target.error);
    };
}

// Theme handling
function toggleTheme() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    document.body.setAttribute('data-theme', isLight ? 'dark' : 'light');
    localStorage.setItem('theme', isLight ? 'dark' : 'light');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
}

// Notes management
function saveNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    const shouldEncrypt = document.getElementById('encryptNote').checked;
    
    if (!title || !content) {
        alert('Please enter both title and content for your note');
        return;
    }
    
    const transaction = db.transaction([NOTES_STORE], 'readwrite');
    const store = transaction.objectStore(NOTES_STORE);
    
    const noteData = {
        title: title,
        content: shouldEncrypt ? CryptoJS.AES.encrypt(content, 'secret-key').toString() : content,
        encrypted: shouldEncrypt,
        createdAt: currentNoteId ? null : Date.now(),
        updatedAt: Date.now()
    };
    
    let request;
    
    if (currentNoteId) {
        // Update existing note
        noteData.id = currentNoteId;
        request = store.put(noteData);
    } else {
        // Create new note
        request = store.add(noteData);
    }
    
    request.onsuccess = function() {
        alert('Note saved successfully!');
        clearNoteForm();
        loadNotesList();
        showNotesList();
    };
    
    request.onerror = function() {
        alert('Error saving note. Please try again.');
    };
}

function clearNoteForm() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('encryptNote').checked = false;
    currentNoteId = null;
}

function loadNotesList() {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.getAll();
    
    request.onsuccess = function() {
        const notes = request.result;
        displayNotes(notes);
        
        // Add event listeners
        document.getElementById('searchNotes').addEventListener('input', function() {
            filterNotes(notes);
        });
        
        document.getElementById('sortNotes').addEventListener('change', function() {
            sortNotes(notes);
        });
    };
}

function displayNotes(notes) {
    const container = document.getElementById('notesContainer');
    container.innerHTML = '';
    
    if (notes.length === 0) {
        container.innerHTML = '<p>No notes yet. Create your first note!</p>';
        return;
    }
    
    // Sort by newest first by default
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    
    notes.forEach(note => {
        const noteItem = document.createElement('div');
        noteItem.className = 'note-item';
        
        // Prepare content preview
        let contentPreview = note.encrypted ? 
            '🔒 Encrypted note' : 
            note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '');
        
        const date = new Date(note.updatedAt);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        noteItem.innerHTML = `
            <div onclick="openNote(${note.id})">
                <div class="note-title">${note.title}</div>
                <div class="note-preview">${contentPreview}</div>
                <div class="note-info">Last updated: ${formattedDate}</div>
            </div>
            <div class="note-actions">
                <button onclick="deleteNote(${note.id}, event)" class="delete-btn">&times;</button>
            </div>
        `;
        
        container.appendChild(noteItem);
    });
}

function openNote(id) {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.get(id);
    
    request.onsuccess = function() {
        const note = request.result;
        currentNoteId = note.id;
        
        document.getElementById('noteTitle').value = note.title;
        
        if (note.encrypted) {
            try {
                const decrypted = CryptoJS.AES.decrypt(note.content, 'secret-key').toString(CryptoJS.enc.Utf8);
                document.getElementById('noteContent').value = decrypted;
            } catch (e) {
                document.getElementById('noteContent').value = "Error decrypting note.";
            }
        } else {
            document.getElementById('noteContent').value = note.content;
        }
        
        document.getElementById('encryptNote').checked = note.encrypted;
        backToEditor();
    };
}

function deleteNote(id, event) {
    event.stopPropagation();
    
    if (confirm('Are you sure you want to delete this note?')) {
        const transaction = db.transaction([NOTES_STORE], 'readwrite');
        const store = transaction.objectStore(NOTES_STORE);
        store.delete(id);
        
        transaction.oncomplete = function() {
            loadNotesList();
        };
    }
}

function filterNotes(notes) {
    const searchTerm = document.getElementById('searchNotes').value.toLowerCase();
    
    const filtered = notes.filter(note => 
        note.title.toLowerCase().includes(searchTerm) || 
        (!note.encrypted && note.content.toLowerCase().includes(searchTerm))
    );
    
    displayNotes(filtered);
}

function sortNotes() {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.getAll();
    
    request.onsuccess = function() {
        const notes = request.result;
        const sortOption = document.getElementById('sortNotes').value;
        
        switch (sortOption) {
            case 'newest':
                notes.sort((a, b) => b.updatedAt - a.updatedAt);
                break;
            case 'oldest':
                notes.sort((a, b) => a.updatedAt - b.updatedAt);
                break;
            case 'az':
                notes.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'za':
                notes.sort((a, b) => b.title.localeCompare(a.title));
                break;
        }
        
        displayNotes(notes);
    };
}

function showNotesList() {
    document.querySelector('.note-editor').style.display = 'none';
    document.getElementById('notesList').style.display = 'block';
}

function backToEditor() {
    document.querySelector('.note-editor').style.display = 'block';
    document.getElementById('notesList').style.display = 'none';
}

// Vault activation
document.querySelector('.fa-lock').addEventListener('click', () => {
    clickCount.push(Date.now());
    clickCount = clickCount.filter(t => Date.now() - t < 2000);
    
    if (clickCount.length === SECRET_CLICK_SEQUENCE.length) {
        showPasswordModal();
        clickCount = [];
    }
});

function showPasswordModal() {
    if (!localStorage.getItem('vaultPassword')) {
        setPassword();
    } else {
        // Show password hint if available
        const hint = localStorage.getItem('passwordHint') || 'Not set';
        document.getElementById('passwordHint').textContent = hint;
        document.getElementById('passwordModal').style.display = 'flex';
    }
}

function setPassword() {
    const password = prompt('Set your vault password:');
    if (password) {
        const passwordHint = prompt('Set a password hint (optional):');
        localStorage.setItem('vaultPassword', CryptoJS.SHA256(password).toString());
        
        if (passwordHint) {
            localStorage.setItem('passwordHint', passwordHint);
        }
    }
}

function checkPassword() {
    const input = document.getElementById('passwordInput').value;
    const hashedPassword = CryptoJS.SHA256(input).toString();
    
    if (hashedPassword === localStorage.getItem('vaultPassword')) {
        document.getElementById('passwordModal').style.display = 'none';
        document.getElementById('vaultInterface').style.display = 'block';
        document.querySelector('.notes-app').style.display = 'none';
        loadFiles();
    } else {
        alert('Incorrect password!');
    }
}

function returnToNotes() {
    document.getElementById('vaultInterface').style.display = 'none';
    document.querySelector('.notes-app').style.display = 'block';
    backToEditor();
}

// File handling
document.getElementById('fileInput').addEventListener('change', function(e) {
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function() {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.add({
                id: Date.now() + '-' + file.name,
                name: file.name,
                type: file.type,
                size: file.size,
                data: reader.result,
                lastModified: file.lastModified,
                dateAdded: Date.now()
            });
            loadFiles();
        };
        reader.readAsDataURL(file);
    });
});

function loadFiles() {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = function() {
        currentFiles = request.result;
        const fileGrid = document.getElementById('fileGrid');
        fileGrid.innerHTML = '';

        if (currentFiles.length === 0) {
            fileGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No files in vault. Add files to get started.</p>';
            return;
        }

        currentFiles.forEach((file, index) => {
            const card = document.createElement('div');
            card.className = 'file-card';
            const dateAdded = new Date(file.dateAdded || file.lastModified).toLocaleDateString();
            
            let icon = '<i class="fas fa-file fa-3x"></i>';
            
            if (file.type.startsWith('image/')) {
                icon = `<img src="${file.data}" alt="${file.name}">`;
            } else if (file.type.startsWith('video/')) {
                icon = '<i class="fas fa-video fa-3x"></i>';
            } else if (file.type.startsWith('audio/')) {
                icon = '<i class="fas fa-music fa-3x"></i>';
            } else if (file.type.includes('pdf')) {
                icon = '<i class="fas fa-file-pdf fa-3x"></i>';
            } else if (file.type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
                icon = '<i class="fas fa-file-word fa-3x"></i>';
            }
            
            card.innerHTML = `
                ${icon}
                <div>${file.name}</div>
                <div style="font-size: 12px; opacity: 0.7;">Added: ${dateAdded}</div>
                <button class="delete-btn" onclick="deleteFile('${file.id}', event)">&times;</button>
            `;
            card.addEventListener('click', () => previewFile(index));
            fileGrid.appendChild(card);
        });
    };
}

function deleteFile(id, event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this file?')) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        loadFiles();
    }
}

// Preview handling
function previewFile(index) {
    currentMediaIndex = index;
    const file = currentFiles[index];
    
    document.getElementById('previewModal').style.display = 'flex';
    document.getElementById('imageViewer').style.display = 'none';
    document.getElementById('videoViewer').style.display = 'none';
    document.getElementById('fileViewer').style.display = 'none';

    if (file.type.startsWith('image/')) {
        document.getElementById('imageViewer').src = file.data;
        document.getElementById('imageViewer').style.display = 'block';
    } else if (file.type.startsWith('video/')) {
        document.getElementById('videoViewer').src = file.data;
        document.getElementById('videoViewer').style.display = 'block';
    } else if (file.type.startsWith('audio/')) {
        // For audio files, create an audio element
        const audioEl = document.createElement('audio');
        audioEl.controls = true;
        audioEl.src = file.data;
        audioEl.className = 'media-viewer';
        
        const fileViewer = document.getElementById('fileViewer');
        fileViewer.innerHTML = '';
        fileViewer.appendChild(audioEl);
        fileViewer.style.display = 'block';
    } else {
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileViewer').style.display = 'block';
    }
}

function navigateMedia(direction) {
    if (currentFiles.length === 0) return;
    
    currentMediaIndex += direction;
    if (currentMediaIndex >= currentFiles.length) currentMediaIndex = 0;
    if (currentMediaIndex < 0) currentMediaIndex = currentFiles.length - 1;
    
    previewFile(currentMediaIndex);
}

function downloadCurrentFile() {
    const file = currentFiles[currentMediaIndex];
    const a = document.createElement('a');
    a.href = file.data;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('password-modal')) {
        document.getElementById('passwordModal').style.display = 'none';
    }
    if (event.target.classList.contains('preview-modal')) {
        document.getElementById('previewModal').style.display = 'none';
    }
};

// Initialize
initDB();