const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json'); // Нужно скачать из Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Создать custom token для тестового пользователя
async function getTestToken() {
  const testUserId = 'test-user-123';
  const customToken = await admin.auth().createCustomToken(testUserId);
  console.log('Custom Token:', customToken);
  
  // Или получить ID token для существующего пользователя
  // const idToken = await admin.auth().createCustomToken(testUserId);
  
  return customToken;
}

// Пример вызова функции
async function testCreateTale() {
  const functions = require('firebase-functions-test')();
  const myFunctions = require('./functions/lib/index');
  
  const wrapped = functions.wrap(myFunctions.createFairyTale);
  
  const data = {
    title: "Test Tale",
    components: {
      hero: { name: "Arthur", type: "knight" },
      friends: [{ name: "Merlin", type: "wizard" }],
      equipment: [],
      villains: [{ name: "Mordred", type: "witch" }],
      places: [{ name: "Camelot", kind: "castle" }]
    }
  };
  
  const context = {
    auth: {
      uid: 'test-user-123',
      token: {}
    }
  };
  
  const result = await wrapped(data, context);
  console.log('Result:', result);
  
  functions.cleanup();
}

getTestToken().catch(console.error);
// testCreateTale().catch(console.error);
