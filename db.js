const DB_NAME = 'FaceRecognitionDB';
const PEOPLE_STORE = 'people';
const version = 1;

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
        };
    });
}

async function addPerson(id, name, birthday, faceDescriptor) {
    const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
    const store = transaction.objectStore(PEOPLE_STORE);
    
    const person = {
        id,
        name,
        birthday,
        faceDescriptor: Array.from(faceDescriptor),
        createdAt: new Date().toISOString()
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

async function updatePerson(id, name, birthday) {
    const person = await getPerson(id);
    if (!person) throw new Error('Person not found');
    
    person.name = name;
    person.birthday = birthday;
    
    const transaction = db.transaction([PEOPLE_STORE], 'readwrite');
    const store = transaction.objectStore(PEOPLE_STORE);

    return new Promise((resolve, reject) => {
        const request = store.put(person);
        request.onsuccess = () => resolve(person);
        request.onerror = () => reject(request.error);
    });
}
