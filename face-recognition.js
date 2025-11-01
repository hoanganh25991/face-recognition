const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const recognizedListEl = document.getElementById('recognizedList');

let people = [];
let recognizedFaces = new Map();
let lastSpokenFaces = new Map();

const CONFIDENCE_THRESHOLD = 0.6;
const DISTANCE_THRESHOLD = 0.6;
const SPEAK_COOLDOWN = 5000;

async function initializeApp() {
    try {
        await initDB();
        statusEl.textContent = '⏳ Loading AI models...';
        statusEl.className = 'status loading';

        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.8/model/';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        people = await getAllPeople();
        statusEl.textContent = '✅ Ready';
        statusEl.className = 'status ready';

        await setupWebcam();
        startFaceDetection();
    } catch (error) {
        console.error('Initialization error:', error);
        statusEl.textContent = '❌ Error: ' + error.message;
    }
}

async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
        });
        video.srcObject = stream;

        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                resolve();
            };
        });
    } catch (error) {
        statusEl.textContent = '❌ Camera access denied';
        throw error;
    }
}

async function startFaceDetection() {
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.5
    });

    setInterval(async () => {
        try {
            const detections = await faceapi
                .detectAllFaces(video, detectionOptions)
                .withFaceLandmarks()
                .withFaceDescriptors();

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            recognizedFaces.clear();

            for (const detection of detections) {
                const { box, landmarks, descriptor } = detection;
                drawBox(box);
                
                const match = findBestMatch(descriptor);
                
                if (match) {
                    recognizedFaces.set(match.id, {
                        ...match,
                        distance: match.distance
                    });
                    drawRecognized(box, match);
                    speakRecognition(match);
                } else {
                    drawUnknown(box);
                }
            }

            updateUI();
        } catch (error) {
            console.error('Detection error:', error);
        }
    }, 100);
}

function findBestMatch(descriptor) {
    if (people.length === 0) return null;

    let bestMatch = null;
    let bestDistance = DISTANCE_THRESHOLD;

    for (const person of people) {
        const personDescriptor = new Float32Array(person.faceDescriptor);
        const distance = faceapi.euclideanDistance(descriptor, personDescriptor);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = {
                id: person.id,
                name: person.name,
                birthday: person.birthday,
                distance: distance
            };
        }
    }

    return bestMatch;
}

function drawBox(box) {
    const { x, y, width, height } = box;
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(x, y + height, width, 30);
}

function drawRecognized(box, match) {
    const { x, y, width, height } = box;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y + height, width, 30);
    
    ctx.fillStyle = '#4CAF50';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${match.name} (${new Date(match.birthday).getFullYear()})`, x + 10, y + height + 20);
}

function drawUnknown(box) {
    const { x, y, width, height } = box;
    
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
    
    ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
    ctx.fillRect(x, y + height, width, 30);
    
    ctx.fillStyle = '#FFA500';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Unknown', x + 10, y + height + 20);
}

function updateUI() {
    recognizedListEl.innerHTML = '';
    
    for (const [_, person] of recognizedFaces) {
        const el = document.createElement('div');
        el.className = 'recognized-person';
        el.innerHTML = `
            <div class="name">${person.name}</div>
            <p>📅 ${new Date(person.birthday).toLocaleDateString('vi-VN')}</p>
            <p class="confidence">Confidence: ${(1 - person.distance).toFixed(2)}</p>
        `;
        recognizedListEl.appendChild(el);
    }

    if (recognizedFaces.size === 0) {
        recognizedListEl.innerHTML = '<p style="color: #888; text-align: center;">No faces recognized</p>';
    }
}

function speakRecognition(person) {
    const now = Date.now();
    const lastSpoken = lastSpokenFaces.get(person.id) || 0;

    if (now - lastSpoken < SPEAK_COOLDOWN) return;

    lastSpokenFaces.set(person.id, now);
    
    const text = `Xin chào, bạn ${person.name}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

initializeApp();
