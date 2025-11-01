const DB_NAME = 'FaceRecognitionDB';
const PEOPLE_STORE = 'people';
const SETTINGS_STORE = 'settings';
const version = 2;

let db;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, version);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            if (!database.objectStoreNames.contains(PEOPLE_STORE)) {
                const store = database.createObjectStore(PEOPLE_STORE, { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: false });
            }
            
            if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
                database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
            }
        };
    });
}

async function addPerson(personData) {
    const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
    const store = transaction.objectStore(PEOPLE_STORE);
    
    // Ensure descriptor is stored as array
    const person = {
        ...personData,
        descriptor: personData.descriptor ? Array.from(personData.descriptor) : null
    };

    return new Promise((resolve, reject) => {
        const request = store.put(person);
        request.onsuccess = () => resolve(person);
        request.onerror = () => reject(request.error);
    });
}

async function getPerson(id) {
    const transaction = db.transaction([PEOPLE_STORE], 'readonly');
    const store = transaction.objectStore(PEOPLE_STORE);

    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllPeople() {
    const transaction = db.transaction([PEOPLE_STORE], 'readonly');
    const store = transaction.objectStore(PEOPLE_STORE);

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deletePerson(id) {
    const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
    const store = transaction.objectStore(PEOPLE_STORE);

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function updatePerson(personOrId, name, birthday) {
    let person;
    
    // If first argument is an object, update the entire person
    if (typeof personOrId === 'object') {
        person = personOrId;
    } else {
        // Legacy: update only name and birthday by ID
        person = await getPerson(personOrId);
        if (!person) throw new Error('Person not found');
        person.name = name;
        person.birthday = birthday;
    }
    
    const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
    const store = transaction.objectStore(PEOPLE_STORE);

    return new Promise((resolve, reject) => {
        const request = store.put(person);
        request.onsuccess = () => resolve(person);
        request.onerror = () => reject(request.error);
    });
}

async function setSetting(key, value) {
    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    
    return new Promise((resolve, reject) => {
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getSetting(key) {
    const transaction = db.transaction([SETTINGS_STORE], 'readonly');
    const store = transaction.objectStore(SETTINGS_STORE);

    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
    });
}
