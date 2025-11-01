const registerVideo = document.getElementById('registerVideo');
const registerCanvas = document.getElementById('registerCanvas');
const registerCtx = registerCanvas.getContext('2d');
const personNameInput = document.getElementById('personName');
const personBirthdayInput = document.getElementById('personBirthday');
const captureBtn = document.getElementById('captureBtn');
const registerBtn = document.getElementById('registerBtn');
const statusEl = document.getElementById('registerStatus');
const peopleListEl = document.getElementById('peopleList');

let capturedDescriptor = null;

async function initAdmin() {
    try {
        await initDB();
        
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.8/model/';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        await setupWebcam();
        await loadPeopleList();
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        registerVideo.srcObject = stream;

        return new Promise((resolve) => {
            registerVideo.onloadedmetadata = () => {
                registerCanvas.width = registerVideo.videoWidth;
                registerCanvas.height = registerVideo.videoHeight;
                resolve();
            };
        });
    } catch (error) {
        showStatus('Camera access denied', 'error');
        throw error;
    }
}

async function captureFace() {
    try {
        const detections = await faceapi
            .detectSingleFace(registerVideo, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detections) {
            showStatus('No face detected. Please position your face clearly.', 'error');
            return;
        }

        capturedDescriptor = detections.descriptor;

        registerCtx.clearRect(0, 0, registerCanvas.width, registerCanvas.height);
        registerCtx.drawImage(registerVideo, 0, 0);

        const { box } = detections.detection;
        registerCtx.strokeStyle = '#4CAF50';
        registerCtx.lineWidth = 3;
        registerCtx.strokeRect(box.x, box.y, box.width, box.height);

        registerBtn.disabled = false;
        showStatus('Face captured! Fill in your details and click Register.', 'success');
    } catch (error) {
        showStatus('Error capturing face: ' + error.message, 'error');
    }
}

async function registerPerson() {
    const name = personNameInput.value.trim();
    const birthday = personBirthdayInput.value;

    if (!name) {
        showStatus('Please enter a name', 'error');
        return;
    }

    if (!birthday) {
        showStatus('Please select a birthday', 'error');
        return;
    }

    if (!capturedDescriptor) {
        showStatus('Please capture a face first', 'error');
        return;
    }

    try {
        const id = generateId();
        await addPerson(id, name, birthday, capturedDescriptor);

        showStatus(`✅ ${name} registered successfully!`, 'success');

        personNameInput.value = '';
        personBirthdayInput.value = '';
        capturedDescriptor = null;
        registerBtn.disabled = true;
        registerCtx.clearRect(0, 0, registerCanvas.width, registerCanvas.height);

        await loadPeopleList();
    } catch (error) {
        showStatus('Error registering person: ' + error.message, 'error');
    }
}

async function loadPeopleList() {
    try {
        const people = await getAllPeople();
        peopleListEl.innerHTML = '';

        if (people.length === 0) {
            peopleListEl.innerHTML = '<p style="grid-column: 1/-1; color: #888; text-align: center;">No registered people yet</p>';
            return;
        }

        for (const person of people) {
            const card = document.createElement('div');
            card.className = 'person-card';
            
            const birthday = new Date(person.birthday);
            const age = new Date().getFullYear() - birthday.getFullYear();

            card.innerHTML = `
                <h3>${person.name}</h3>
                <p>📅 ${birthday.toLocaleDateString('vi-VN')}</p>
                <p>🎂 Age: ${age}</p>
                <div class="id">ID: ${person.id}</div>
                <div class="button-group">
                    <button class="danger" onclick="handleDeletePerson('${person.id}', '${person.name}')">🗑️ Delete</button>
                </div>
            `;

            peopleListEl.appendChild(card);
        }
    } catch (error) {
        showStatus('Error loading people: ' + error.message, 'error');
    }
}

async function handleDeletePerson(id, name) {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
        try {
            await deletePerson(id);
            showStatus(`${name} deleted successfully`, 'success');
            await loadPeopleList();
        } catch (error) {
            showStatus('Error deleting person: ' + error.message, 'error');
        }
    }
}

function generateId() {
    return 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + type;
    
    if (type !== 'error') {
        setTimeout(() => {
            statusEl.className = 'status-message';
        }, 5000);
    }
}

initAdmin();
