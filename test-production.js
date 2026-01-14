const admin = require('firebase-admin');

// Инициализация с Service Account
// Скачайте serviceAccountKey.json из Firebase Console:
// Project Settings -> Service Accounts -> Generate new private key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const BASE_URL = 'https://europe-west1-fairytales-app.cloudfunctions.net';

// 1. Получить ID token для пользователя
async function getIdToken(uid) {
  try {
    // Создать custom token
    const customToken = await admin.auth().createCustomToken(uid);
    console.log('Custom Token создан для UID:', uid);
    
    // Обменять custom token на ID token через Firebase Auth REST API
    const apiKey = 'YOUR_FIREBASE_WEB_API_KEY'; // Из Firebase Console -> Project Settings -> General -> Web API Key
    
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true
      })
    });
    
    const data = await response.json();
    
    if (data.idToken) {
      console.log('\n✅ ID Token получен успешно!');
      console.log('ID Token:', data.idToken);
      console.log('\nExpires in:', data.expiresIn, 'seconds');
      return data.idToken;
    } else {
      console.error('❌ Ошибка получения ID token:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    return null;
  }
}

// 2. Создать сказку
async function createTale(idToken) {
  console.log('\n📝 Создание сказки...');
  
  const response = await fetch(`${BASE_URL}/createFairyTale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      data: {
        title: "Приключения храброго рыцаря",
        components: {
          hero: { name: "Артур", type: "knight" },
          friends: [{ name: "Мерлин", type: "wizard" }],
          equipment: [{ name: "Экскалибур", description: "Легендарный меч" }],
          villains: [{ name: "Моргана", type: "witch" }],
          places: [{ name: "Камелот", kind: "замок" }]
        }
      }
    })
  });
  
  const result = await response.json();
  console.log('Результат:', JSON.stringify(result, null, 2));
  
  return result.result?.taleId;
}

// 3. Сгенерировать текст сказки
async function generateTaleContent(idToken, taleId) {
  console.log('\n🎨 Генерация текста сказки...');
  
  const response = await fetch(`${BASE_URL}/generateTaleContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      data: { taleId }
    })
  });
  
  const result = await response.json();
  console.log('Результат:', JSON.stringify(result, null, 2));
}

// 4. Получить список сказок
async function getUserTales(idToken) {
  console.log('\n📚 Получение списка сказок...');
  
  const response = await fetch(`${BASE_URL}/getUserTales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      data: { limit: 10 }
    })
  });
  
  const result = await response.json();
  console.log('Результат:', JSON.stringify(result, null, 2));
}

// 5. Удалить сказку
async function deleteTale(idToken, taleId) {
  console.log('\n🗑️  Удаление сказки...');
  
  const response = await fetch(`${BASE_URL}/deleteFairyTale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      data: { taleId }
    })
  });
  
  const result = await response.json();
  console.log('Результат:', JSON.stringify(result, null, 2));
}

// Главная функция
async function main() {
  const uid = process.argv[2];
  
  if (!uid) {
    console.error('❌ Укажите UID пользователя:');
    console.log('node test-production.js YOUR_USER_UID');
    console.log('\nUID можно найти в Firebase Console -> Authentication -> Users');
    process.exit(1);
  }
  
  console.log('🚀 Тестирование Production API');
  console.log('================================\n');
  
  // Получить токен
  const idToken = await getIdToken(uid);
  if (!idToken) {
    console.error('❌ Не удалось получить токен');
    process.exit(1);
  }
  
  // Тестирование
  const taleId = await createTale(idToken);
  
  if (taleId) {
    await generateTaleContent(idToken, taleId);
    await getUserTales(idToken);
    // await deleteTale(idToken, taleId); // Раскомментируйте для удаления
  }
  
  console.log('\n✅ Тестирование завершено!');
  process.exit(0);
}

main().catch(console.error);
