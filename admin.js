const registerVideo = document.getElementById('registerVideo');
const registerCanvas = document.getElementById('registerCanvas');
const registerCtx = registerCanvas.getContext('2d');
const personNameInput = document.getElementById('personName');
const personBirthdayInput = document.getElementById('personBirthday');
const captureBtn = document.getElementById('captureBtn');
const registerBtn = document.getElementById('registerBtn');
const registerStatus = document.getElementById('registerStatus');
const peopleListEl = document.getElementById('peopleList');
const googleApiKeyInput = document.getElementById('googleApiKey');
const settingsStatus = document.getElementById('settingsStatus');

let capturedImages = []; // Array to store multiple images and descriptors
let googleApiKey = null;

async function initAdmin() {
    try {
        await initDB();
        
        googleApiKey = await getSetting('googleApiKey');
        if (googleApiKey) {
            googleApiKeyInput.value = googleApiKey;
        }
        
        // Load threshold settings
        await loadThresholds();
        
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.8/model/';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        // Setup video
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 400 },
                height: { ideal: 400 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        registerVideo.srcObject = stream;

        registerVideo.onloadedmetadata = () => {
            registerCanvas.width = registerVideo.videoWidth;
            registerCanvas.height = registerVideo.videoHeight;
        };

        await loadPeopleList();
    } catch (error) {
        console.error('Init error:', error);
        showMessage('registerStatus', 'Error initializing admin panel: ' + error.message, 'error');
    }
}

async function captureFace() {
    try {
        if (!registerVideo.srcObject) {
            showMessage('captureStatus', 'Camera not initialized', 'error');
            return;
        }

        // Show processing message
        showMessage('captureStatus', '📸 Detecting face...', 'info');

        // Draw current video frame to canvas
        registerCtx.drawImage(registerVideo, 0, 0, registerCanvas.width, registerCanvas.height);

        // Use more lenient detection options for better success rate
        const detection = await faceapi
            .detectSingleFace(registerCanvas, new faceapi.TinyFaceDetectorOptions({
                inputSize: 416,  // Larger input for better accuracy
                scoreThreshold: 0.4  // Lower threshold to detect more faces
            }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            // Clear canvas so webcam remains visible
            registerCtx.clearRect(0, 0, registerCanvas.width, registerCanvas.height);
            showMessage('captureStatus', '❌ No face detected. Position yourself clearly in view.', 'error');
            return;
        }

        // Save the image data before clearing
        const imageData = registerCanvas.toDataURL('image/jpeg', 0.9);
        
        // Clear canvas immediately so webcam feed remains visible
        registerCtx.clearRect(0, 0, registerCanvas.width, registerCanvas.height);
        
        // Add to array of captured images
        capturedImages.push({
            descriptor: Array.from(detection.descriptor),
            image: imageData
        });
        
        updateImagePreview();
        registerBtn.disabled = false;
        
        // Show success in capture status
        showMessage('captureStatus', `✅ Face ${capturedImages.length} captured! You can capture more.`, 'success');
        
        // Auto-hide success message after 2 seconds
        setTimeout(() => {
            const captureStatusEl = document.getElementById('captureStatus');
            if (captureStatusEl.classList.contains('success')) {
                captureStatusEl.className = 'status-message';
            }
        }, 2000);
    } catch (error) {
        console.error('Capture error:', error);
        // Clear canvas on error
        registerCtx.clearRect(0, 0, registerCanvas.width, registerCanvas.height);
        showMessage('captureStatus', 'Error: ' + error.message, 'error');
    }
}

async function uploadImages(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    showMessage('registerStatus', '⏳ Processing uploaded images...', 'info');

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        try {
            const img = await loadImage(file);
            
            // Create canvas for processing
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0);

            // Detect face
            const detection = await faceapi
                .detectSingleFace(tempCanvas, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                console.warn('No face detected in:', file.name);
                errorCount++;
                continue;
            }

            const imageData = tempCanvas.toDataURL('image/jpeg', 0.9);
            
            capturedImages.push({
                descriptor: Array.from(detection.descriptor),
                image: imageData
            });
            
            successCount++;
        } catch (error) {
            console.error('Error processing', file.name, error);
            errorCount++;
        }
    }

    updateImagePreview();
    
    if (successCount > 0) {
        registerBtn.disabled = false;
        showMessage('registerStatus', `✅ ${successCount} image(s) processed${errorCount > 0 ? ` (${errorCount} failed)` : ''}`, 'success');
    } else {
        showMessage('registerStatus', `❌ No faces detected in uploaded images`, 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function updateImagePreview() {
    const container = document.getElementById('imagePreviewContainer');
    const countEl = document.getElementById('imageCount');
    const capturedImagesDiv = document.getElementById('capturedImages');
    
    if (capturedImages.length === 0) {
        capturedImagesDiv.style.display = 'none';
        return;
    }
    
    capturedImagesDiv.style.display = 'block';
    countEl.textContent = capturedImages.length;
    container.innerHTML = '';
    
    capturedImages.forEach((item, index) => {
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = 'position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid #00d4ff;';
        
        const img = document.createElement('img');
        img.src = item.image;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background: rgba(255,76,76,0.9); color: white; border: none; cursor: pointer; font-size: 16px; line-height: 1; padding: 0;';
        deleteBtn.onclick = () => removeImage(index);
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(deleteBtn);
        container.appendChild(imgContainer);
    });
}

function removeImage(index) {
    capturedImages.splice(index, 1);
    updateImagePreview();
    
    if (capturedImages.length === 0) {
        registerBtn.disabled = true;
    }
    
    showMessage('registerStatus', `Image removed. ${capturedImages.length} remaining.`, 'info');
}

function clearAllImages() {
    capturedImages = [];
    updateImagePreview();
    registerBtn.disabled = true;
    registerCtx.clearRect(0, 0, registerCanvas.width, registerCanvas.height);
    showMessage('registerStatus', 'All images cleared', 'info');
}

async function registerPerson() {
    try {
        const name = personNameInput.value.trim();
        const dob = personBirthdayInput.value;

        if (!name) {
            showMessage('registerStatus', 'Please enter a name', 'error');
            return;
        }

        if (capturedImages.length === 0) {
            showMessage('registerStatus', 'Please capture or upload at least one image', 'error');
            return;
        }

        // Store person with multiple descriptors
        const person = {
            id: Date.now().toString(),
            name: name,
            dob: dob || null,
            descriptors: capturedImages.map(img => img.descriptor), // Array of descriptors
            picture: capturedImages[0].image, // Use first image as primary picture
            imageCount: capturedImages.length,
            registered_at: new Date().toISOString()
        };

        await addPerson(person);

        showMessage('registerStatus', `✅ ${name} registered with ${capturedImages.length} image(s)! Generating greeting...`, 'success');
        
        // Generate TTS greeting in background (async, don't wait)
        generateTTSGreeting(person.id, name).catch(err => {
            console.error('Failed to generate TTS:', err);
        });
        
        // Reset form
        personNameInput.value = '';
        personBirthdayInput.value = '';
        clearAllImages();

        await loadPeopleList();
    } catch (error) {
        console.error('Register error:', error);
        showMessage('registerStatus', 'Error registering person: ' + error.message, 'error');
    }
}

async function generateTTSGreeting(personId, name) {
    try {
        const googleApiKey = await getSetting('googleApiKey');
        if (!googleApiKey) {
            console.log('TTS: Google API key not configured');
            return;
        }

        const text = `Xin chào bạn ${name}`;
        
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
            // Store TTS in person record
            const person = await getPerson(personId);
            if (person) {
                person.ttsGreeting = data.audioContent;
                await addPerson(person); // Update with TTS
                console.log(`✅ TTS generated for: ${name}`);
            }
        }
    } catch (error) {
        console.error('TTS generation error:', error);
    }
}

async function previewGreeting(personId, name) {
    try {
        const person = await getPerson(personId);
        
        if (person && person.ttsGreeting) {
            // Play cached TTS
            const audio = new Audio(`data:audio/mp3;base64,${person.ttsGreeting}`);
            audio.play();
        } else {
            // Generate TTS if not cached
            showMessage('registerStatus', '🔊 Generating greeting...', 'info');
            
            const googleApiKey = await getSetting('googleApiKey');
            if (!googleApiKey) {
                showMessage('registerStatus', '❌ Google API key not configured', 'error');
                return;
            }

            const text = `Xin chào bạn ${name}`;
            
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
                
                // Cache it
                if (person) {
                    person.ttsGreeting = data.audioContent;
                    await addPerson(person);
                }
                
                // Play it
                const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
                audio.play();
                
                showMessage('registerStatus', '🔊 Playing greeting...', 'success');
            } else {
                showMessage('registerStatus', '❌ Failed to generate greeting', 'error');
            }
        }
    } catch (error) {
        console.error('Preview error:', error);
        showMessage('registerStatus', '❌ Error: ' + error.message, 'error');
    }
}

async function handleDeletePerson(id) {
    if (confirm('Are you sure you want to delete this person?')) {
        try {
            await deletePerson(id);
            showMessage('registerStatus', 'Person deleted successfully', 'success');
            await loadPeopleList();
        } catch (error) {
            showMessage('registerStatus', 'Error deleting person: ' + error.message, 'error');
        }
    }
}

async function loadPeopleList() {
    try {
        const people = await getAllPeople();
        peopleListEl.innerHTML = '';

        if (people.length === 0) {
            peopleListEl.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">No registered people yet</div>';
            return;
        }

        people.forEach(person => {
            const age = calculateAge(person.dob);
            const ageStr = age ? ` (${age}y)` : '';
            const dobStr = person.dob ? new Date(person.dob).toLocaleDateString() : 'Not set';
            const imageCount = person.imageCount || (person.descriptors ? person.descriptors.length : 1);

            const card = document.createElement('div');
            card.className = 'person-card';
            card.innerHTML = `
                <div class="person-avatar">
                    ${person.picture ? `<img src="${person.picture}" alt="${person.name}">` : '<div style="width: 100%; height: 100%; background: #333; display: flex; align-items: center; justify-content: center; color: #666;">📷</div>'}
                </div>
                <div class="person-info">
                    <h3>${person.name}${ageStr}</h3>
                    <p>📅 ${dobStr}</p>
                    <p>🖼️ ${imageCount} image${imageCount > 1 ? 's' : ''}</p>
                </div>
                <div class="person-actions">
                    <button class="btn btn-secondary" onclick="previewGreeting('${person.id}', '${person.name}')" style="width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center;" title="Preview greeting">🔊</button>
                    <button class="btn btn-danger" onclick="handleDeletePerson('${person.id}')" style="width: 36px; height: 36px; padding: 0; display: flex; align-items: center; justify-content: center;" title="Delete">🗑️</button>
                </div>
            `;
            peopleListEl.appendChild(card);
        });
    } catch (error) {
        console.error('Load people error:', error);
        peopleListEl.innerHTML = '<div style="color: #ff4c4c; padding: 20px;">Error loading people</div>';
    }
}

async function saveApiKey() {
    const apiKey = document.getElementById('googleApiKey').value;
    
    if (!apiKey) {
        showStatus('settingsStatus', 'Please enter an API key', 'error');
        return;
    }

    try {
        await setSetting('googleApiKey', apiKey);
        showStatus('settingsStatus', '✅ API key saved successfully!', 'success');
    } catch (error) {
        showStatus('settingsStatus', '❌ Failed to save API key', 'error');
        console.error('Save API key error:', error);
    }
}

function updateThresholdDisplay() {
    const distanceValue = document.getElementById('distanceThreshold').value;
    const confidenceValue = document.getElementById('confidenceThreshold').value;
    
    document.getElementById('distanceValue').textContent = distanceValue;
    document.getElementById('confidenceValue').textContent = confidenceValue + '%';
}

async function saveThresholds() {
    const distanceThreshold = parseFloat(document.getElementById('distanceThreshold').value);
    const confidenceThreshold = parseInt(document.getElementById('confidenceThreshold').value);
    
    try {
        await setSetting('distanceThreshold', distanceThreshold);
        await setSetting('confidenceThreshold', confidenceThreshold);
        showStatus('settingsStatus', '✅ Thresholds saved successfully! Reload recognition page to apply.', 'success');
    } catch (error) {
        showStatus('settingsStatus', '❌ Failed to save thresholds', 'error');
        console.error('Save thresholds error:', error);
    }
}

async function loadThresholds() {
    try {
        const distanceThreshold = await getSetting('distanceThreshold');
        const confidenceThreshold = await getSetting('confidenceThreshold');
        
        if (distanceThreshold !== undefined) {
            document.getElementById('distanceThreshold').value = distanceThreshold;
        }
        if (confidenceThreshold !== undefined) {
            document.getElementById('confidenceThreshold').value = confidenceThreshold;
        }
        
        updateThresholdDisplay();
    } catch (error) {
        console.error('Load thresholds error:', error);
    }
}

async function loadPredefinedData() {
    // Create file input for JSON upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showMessage('registerStatus', '⏳ Loading JSON file...', 'info');
            
            const text = await file.text();
            const data = JSON.parse(text);

            if (!Array.isArray(data.people)) {
                throw new Error('Invalid JSON format. Expected "people" array.');
            }

            let successCount = 0;
            let errorCount = 0;

            for (const person of data.people) {
                try {
                    // Validate required fields
                    if (!person.name || !person.pictures || !Array.isArray(person.pictures)) {
                        console.warn('Skipping person: missing name or pictures array', person);
                        errorCount++;
                        continue;
                    }

                    const descriptors = [];
                    const images = [];

                    // Process each picture (URL or base64)
                    for (const pictureSource of person.pictures) {
                        try {
                            const img = new Image();
                            img.crossOrigin = 'anonymous';
                            
                            await new Promise((resolve, reject) => {
                                img.onload = resolve;
                                img.onerror = reject;
                                img.src = pictureSource; // Can be URL or base64
                            });

                            // Create canvas for image processing
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = img.width;
                            tempCanvas.height = img.height;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.drawImage(img, 0, 0);

                            // Detect face and extract descriptor
                            const detection = await faceapi
                                .detectSingleFace(tempCanvas, new faceapi.TinyFaceDetectorOptions())
                                .withFaceLandmarks()
                                .withFaceDescriptor();

                            if (detection) {
                                descriptors.push(Array.from(detection.descriptor));
                                images.push(tempCanvas.toDataURL('image/jpeg', 0.9));
                            }
                        } catch (imgError) {
                            console.warn('Error processing image for', person.name, imgError);
                        }
                    }

                    if (descriptors.length === 0) {
                        console.warn('No faces detected for:', person.name);
                        errorCount++;
                        continue;
                    }

                    // Save to IndexedDB with multiple descriptors
                    const newPerson = {
                        id: Date.now().toString() + Math.random(),
                        name: person.name,
                        dob: person.dob || null,
                        descriptors: descriptors,
                        picture: images[0], // Use first image as primary
                        imageCount: descriptors.length,
                        registered_at: new Date().toISOString()
                    };

                    await addPerson(newPerson);
                    successCount++;
                    console.log(`Loaded: ${person.name} with ${descriptors.length} image(s)`);
                } catch (error) {
                    console.error(`Error loading ${person.name}:`, error);
                    errorCount++;
                }
            }

            // Load Google API key from settings if present
            if (data.settings && data.settings.googleApiKey) {
                try {
                    await setSetting('googleApiKey', data.settings.googleApiKey);
                    googleApiKey = data.settings.googleApiKey;
                    googleApiKeyInput.value = data.settings.googleApiKey;
                    console.log('✅ Google API key loaded from import');
                } catch (error) {
                    console.error('Error loading Google API key:', error);
                }
            }

            const message = `✅ Loaded ${successCount} people${errorCount > 0 ? ` (${errorCount} failed)` : ''}`;
            showMessage('registerStatus', message, successCount > 0 ? 'success' : 'error');

            await loadPeopleList();
        } catch (error) {
            console.error('Load data error:', error);
            showMessage('registerStatus', 'Error loading JSON: ' + error.message, 'error');
        }
    };
    
    input.click();
}

function downloadSampleData() {
    const sampleData = {
        "people": [
            {
                "name": "John Doe",
                "dob": "1990-05-15",
                "pictures": [
                    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop"
                ]
            },
            {
                "name": "Jane Smith",
                "dob": "1992-08-22",
                "pictures": [
                    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop"
                ]
            },
            {
                "name": "Bob Johnson",
                "dob": "1985-03-10",
                "pictures": [
                    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop"
                ]
            }
        ],
        "settings": {
            "googleApiKey": ""
        }
    };

    const dataStr = JSON.stringify(sampleData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data-template.json';
    link.click();
    URL.revokeObjectURL(url);

    showMessage('registerStatus', '📋 Template downloaded! Add URLs or base64 images to "pictures" array.', 'info');
}

async function exportRegisteredFaces() {
    try {
        showMessage('registerStatus', '⏳ Exporting registered faces...', 'info');
        
        const people = await getAllPeople();
        
        if (people.length === 0) {
            showMessage('registerStatus', 'No registered faces to export', 'error');
            return;
        }

        // Get Google API key from settings
        const googleApiKey = await getSetting('googleApiKey');
        
        // Convert registered people to export format
        const exportData = {
            people: people.map(person => {
                // Collect all images (reconstruct from descriptors if needed)
                const pictures = [];
                
                // Add primary picture if it exists
                if (person.picture) {
                    pictures.push(person.picture);
                }
                
                // If we have multiple descriptors but only one picture stored,
                // we'll just export what we have
                // In future, we could store all images separately
                
                return {
                    name: person.name,
                    dob: person.dob || null,
                    pictures: pictures
                };
            }),
            settings: {
                googleApiKey: googleApiKey || ""
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `faces-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);

        showMessage('registerStatus', `✅ Exported ${people.length} registered face(s) with base64 images`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showMessage('registerStatus', 'Error exporting faces: ' + error.message, 'error');
    }
}

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status-message ${type}`;
    
    setTimeout(() => {
        element.className = 'status-message';
    }, 5000);
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

// Initialize on load
document.addEventListener('DOMContentLoaded', initAdmin);
