const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const videoContainer = document.getElementById('videoContainer');
const startScreen = document.getElementById('startScreen');
const bannerContent = document.getElementById('bannerContent');
const faceLinesSvg = document.getElementById('faceLines');

let people = [];
let recognizedFaces = new Map();
let lastSpokenFaces = new Map();
let lastSeenInFrame = new Map(); // Track when each person was last detected in frame
let isAppStarted = false;
let ttsEnabled = false;
let ttsQueue = [];
let isProcessingTTS = false;

// Thresholds - loaded from settings on startup
let CONFIDENCE_THRESHOLD = 0.60;
let DISTANCE_THRESHOLD = 0.58;
const SPEAK_COOLDOWN = 15000; // 15 seconds cooldown
const OUT_OF_FRAME_THRESHOLD = 1000; // seconds - reset greeting if person was gone this long

async function startApp() {
    try {
        startScreen.style.display = 'none';
        videoContainer.style.display = 'flex';
        isAppStarted = true;
        ttsEnabled = true;

        showStatus('⏳ Loading AI models...');

        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.8/model/';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        await initDB();
        
        // Load threshold settings from database
        const savedDistanceThreshold = await getSetting('distanceThreshold');
        const savedConfidenceThreshold = await getSetting('confidenceThreshold');
        
        if (savedDistanceThreshold !== undefined) {
            DISTANCE_THRESHOLD = savedDistanceThreshold;
            console.log(`📏 Distance Threshold: ${DISTANCE_THRESHOLD}`);
        }
        if (savedConfidenceThreshold !== undefined) {
            CONFIDENCE_THRESHOLD = savedConfidenceThreshold / 100; // Convert percentage to decimal
            console.log(`✅ Confidence Threshold: ${Math.round(CONFIDENCE_THRESHOLD * 100)}%`);
        }
        
        people = await getAllPeople();
        
        console.log(`Loaded ${people.length} people for recognition`);
        people.forEach(person => {
            const descCount = person.descriptors ? person.descriptors.length : 1;
            console.log(`- ${person.name}: ${descCount} descriptor(s)`);
        });

        // Setup video
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;

        // Wait for video to load
        video.onloadedmetadata = () => {
            // Set canvas to match the displayed size, not the video resolution
            resizeCanvas();
            showStatus('🟢 System Ready - Detecting faces...');
            detectFaces();
        };
        
        // Handle window resize
        window.addEventListener('resize', resizeCanvas);
        
        // Auto-reload people list when page becomes visible
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden && isAppStarted) {
                const newPeople = await getAllPeople();
                if (newPeople.length !== people.length) {
                    people = newPeople;
                    console.log(`✅ Auto-reloaded: ${people.length} people`);
                    people.forEach(person => {
                        const descCount = person.descriptors ? person.descriptors.length : 1;
                        console.log(`- ${person.name}: ${descCount} descriptor(s)`);
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error:', error);
        showStatus('❌ Error: ' + error.message);
    }
}

function showStatus(message) {
    bannerContent.innerHTML = `<div class="status-indicator"></div><span style="color: #00d4ff; font-size: 12px;">${message}</span>`;
}

function resizeCanvas() {
    // Get the displayed dimensions of the video
    const displayWidth = video.offsetWidth;
    const displayHeight = video.offsetHeight;
    
    // Set canvas to match displayed video size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    // Update canvas style to match
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    faceLinesSvg.setAttribute('viewBox', `0 0 ${displayWidth} ${displayHeight}`);
}

async function detectFaces() {
    if (!isAppStarted) return;

    try {
        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors();

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Clear SVG
        faceLinesSvg.innerHTML = '';

        // Track people detected in THIS frame
        const currentlyDetectedPeople = new Set();
        recognizedFaces.clear();

        if (detections.length === 0) {
            showStatus('👀 No faces detected - Looking...');
        } else {
            // Calculate scale factors between video resolution and display size
            const scaleX = canvas.width / video.videoWidth;
            const scaleY = canvas.height / video.videoHeight;

            // Process each detected face
            detections.forEach((detection, index) => {
                // Scale the bounding box to match canvas display size
                const originalBox = detection.detection.box;
                const box = {
                    x: originalBox.x * scaleX,
                    y: originalBox.y * scaleY,
                    width: originalBox.width * scaleX,
                    height: originalBox.height * scaleY
                };
                
                // Scale landmarks
                const scaledLandmarks = {
                    positions: detection.landmarks.positions.map(point => ({
                        x: point.x * scaleX,
                        y: point.y * scaleY
                    }))
                };
                
                const descriptor = detection.descriptor;

                // Try to match with known faces first
                let bestMatch = null;
                let bestDistance = DISTANCE_THRESHOLD;
                let isRecognized = false;

                people.forEach(person => {
                    // Support both single descriptor (old format) and multiple descriptors (new format)
                    const descriptors = person.descriptors || [person.descriptor];
                    
                    // Find the best match among all descriptors for this person
                    descriptors.forEach((personDescriptor, descIndex) => {
                        if (personDescriptor) {
                            const distance = faceapi.euclideanDistance(descriptor, personDescriptor);
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestMatch = person;
                            }
                        }
                    });
                });

                if (bestMatch) {
                    const confidence = Math.round((1 - bestDistance) * 100);
                    if (confidence >= CONFIDENCE_THRESHOLD * 100) {
                        isRecognized = true;
                        currentlyDetectedPeople.add(bestMatch.id);
                        
                        recognizedFaces.set(bestMatch.id, {
                            name: bestMatch.name,
                            dob: bestMatch.dob,
                            confidence: confidence,
                            box: box
                        });

                        // Draw green box for recognized face
                        drawFaceBox(box, true);

                        // Draw label
                        drawFaceLabel(box, bestMatch.name, confidence);

                        // Speak if new
                        speakRecognition(bestMatch, confidence);
                    }
                }

                // Draw box with appropriate color
                if (!isRecognized) {
                    drawFaceBox(box, false);
                }

                // Draw AI-like connection lines with scaled landmarks
                drawAILines(scaledLandmarks, index);
            });

            updateBanner();
        }
        
        // Update lastSeenInFrame for all detected people
        const now = Date.now();
        currentlyDetectedPeople.forEach(personId => {
            lastSeenInFrame.set(personId, now);
        });
        
    } catch (error) {
        console.error('Detection error:', error);
    }

    requestAnimationFrame(detectFaces);
}

function drawFaceBox(box, isRecognized = false) {
    const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
    
    if (isRecognized) {
        // Green gradient for recognized faces
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 255, 100, 0.6)');
    } else {
        // Blue gradient for unrecognized faces
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0.4)');
    }
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.width, box.height, 10);
    ctx.stroke();
}

function drawAILines(landmarks, index) {
    if (!landmarks || landmarks.length === 0) return;

    const points = landmarks.positions;
    
    // Draw connections between key facial landmarks
    const keyPoints = [0, 8, 16, 36, 45, 30]; // forehead, chin, ears, eyes, nose

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth = 2;

    for (let i = 0; i < keyPoints.length - 1; i++) {
        const p1 = points[keyPoints[i]];
        const p2 = points[keyPoints[i + 1]];
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Draw circles at key points
        ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFaceLabel(box, name, confidence) {
    const label = `${name} (${confidence}%)`;
    const fontSize = 14;
    const padding = 8;

    ctx.font = `bold ${fontSize}px Arial`;
    const metrics = ctx.measureText(label);
    const width = metrics.width + padding * 2;
    const height = fontSize + padding * 2;

    const x = box.x;
    const y = Math.max(height, box.y - 10);

    // Save current context state
    ctx.save();

    // Draw background
    const gradient = ctx.createLinearGradient(x, y - height, x, y);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0.8)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y - height, width, height, 5);
    ctx.fill();

    // Flip horizontally for text only (since canvas is mirrored via CSS)
    // Translate to text position, scale to flip, then translate back
    ctx.translate(x + width / 2, y - height / 2);
    ctx.scale(-1, 1);
    ctx.translate(-(x + width / 2), -(y - height / 2));

    // Draw text
    ctx.fillStyle = '#0a0e27';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + padding, y - padding);
    
    // Restore context state
    ctx.restore();
}

function updateBanner() {
    if (recognizedFaces.size === 0) {
        showStatus('👀 Looking for faces...');
        return;
    }

    let html = '<div class="status-indicator"></div>';
    
    recognizedFaces.forEach((face, id) => {
        const age = calculateAge(face.dob);
        const ageStr = age ? ` (${age}y)` : '';
        html += `<div class="person-badge">
            <span class="name">${face.name}</span>
            <span class="age">${face.confidence}%${ageStr}</span>
        </div>`;
    });

    bannerContent.innerHTML = html;
}

function calculateAge(dobString) {
    if (!dobString) return null;
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age > 0 ? age : null;
}

async function speakRecognition(person, confidence) {
    if (!ttsEnabled) return;

    const now = Date.now();
    const lastSeen = lastSeenInFrame.get(person.id) || 0;
    const lastSpoken = lastSpokenFaces.get(person.id) || 0;
    
    // Check if person was out of frame for more than OUT_OF_FRAME_THRESHOLD
    // If so, reset their greeting cooldown (they're "new" again)
    if (now - lastSeen > OUT_OF_FRAME_THRESHOLD) {
        console.log(`👋 ${person.name} returned to frame after being away`);
        lastSpokenFaces.delete(person.id); // Reset cooldown
    }
    
    // NOTE: lastSeenInFrame is now updated at the end of detectFaces() for all detected people
    // This ensures we only count actual out-of-frame time, not skipped frame detection

    // Check if we've recently greeted this person (within cooldown period)
    if (now - lastSpoken < SPEAK_COOLDOWN) {
        return;
    }

    // Check if this person is already in the queue (waiting to be greeted)
    const alreadyQueued = ttsQueue.some(item => item.personId === person.id);
    if (alreadyQueued) {
        return;
    }

    // Add to queue and mark as "pending" to prevent duplicates
    ttsQueue.push({
        personId: person.id,
        name: person.name,
        timestamp: now
    });
    
    // Update last spoken time immediately when adding to queue
    // This prevents the same person being added multiple times before the audio plays
    lastSpokenFaces.set(person.id, now);
    
    // Start processing queue if not already processing
    if (!isProcessingTTS) {
        processTTSQueue();
    }
}

async function processTTSQueue() {
    if (ttsQueue.length === 0) {
        isProcessingTTS = false;
        return;
    }

    isProcessingTTS = true;
    const item = ttsQueue.shift();

    try {
        // Load person from database to check for cached TTS
        const person = await getPerson(item.personId);
        
        if (!person) {
            console.warn(`Person ${item.personId} not found in database`);
            setTimeout(() => processTTSQueue(), 500);
            return;
        }

        // Check if TTS is already cached in database
        if (person.ttsGreeting) {
            // Use cached audio for instant playback
            const audio = new Audio(`data:audio/mp3;base64,${person.ttsGreeting}`);
            
            await new Promise((resolve) => {
                audio.onended = resolve;
                audio.onerror = resolve;
                audio.play().catch(e => {
                    console.log('Audio playback prevented:', e);
                    resolve();
                });
            });
            
            lastSpokenFaces.set(item.personId, item.timestamp);
        } else {
            // Generate TTS and cache it in database
            const googleApiKey = await getSetting('googleApiKey');
            if (!googleApiKey) {
                console.warn('Google API key not configured');
                isProcessingTTS = false;
                return;
            }

            const text = `Xin chào bạn ${item.name}`;
            
            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text },
                    voice: {
                        languageCode: 'vi-VN',
                        name: 'vi-VN-Wavenet-A'
                    },
                    audioConfig: { 
                        audioEncoding: 'MP3', 
                        pitch: 0,
                        speakingRate: 1.0
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Store TTS in database for future use
                person.ttsGreeting = data.audioContent;
                await updatePerson(person);
                console.log(`✅ Generated and cached TTS for: ${item.name}`);
                
                const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
                
                await new Promise((resolve) => {
                    audio.onended = resolve;
                    audio.onerror = resolve;
                    audio.play().catch(e => {
                        console.log('Audio playback prevented:', e);
                        resolve();
                    });
                });
                
                lastSpokenFaces.set(item.personId, item.timestamp);
            }
        }
    } catch (error) {
        console.error('TTS Error:', error);
    }

    // Process next item in queue after a short delay
    setTimeout(() => processTTSQueue(), 500);
}

async function reloadPeople() {
    people = await getAllPeople();
    showStatus('✅ People list reloaded');
}

// Support for older browsers
if (!Path2D.prototype.roundRect && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}
