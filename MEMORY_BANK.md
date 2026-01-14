# Memory Bank - Fairytales Backend

## Архитектурные решения

### Генерация сказок через n8n

#### Контекст
- База данных: Firebase Firestore
- Функции: Firebase Cloud Functions
- Внешний сервис: n8n для генерации текста сказок
- Клиент: мобильное приложение

#### Принятое решение: Запрос в n8n с бэкенда (не с мобилки)

**Причины:**
1. **Безопасность** - API ключи и credentials для n8n остаются на сервере
2. **Надежность** - генерация продолжится даже если мобильное приложение закроется
3. **Контроль** - централизованное логирование и обработка ошибок
4. **Валидация** - проверка всех данных перед отправкой в n8n
5. **Сохранение результата** - бэкенд гарантированно сохранит `taleText` в Firebase

---

## Подходы к генерации

### Вариант 1: Синхронный подход (не выбран, но может пригодиться)

**Как работает:**
```
Мобилка → generateTaleContent(taleId) → [ОЖИДАНИЕ]
    ↓
Бэкенд → n8n → [ОЖИДАНИЕ] → ответ с taleText
    ↓
Бэкенд сохраняет taleText → возвращает результат
    ↓
Мобилка получает готовый текст
```

**Подходит для:** генерация < 30-60 секунд

**Плюсы:**
- Простая реализация
- Проще тестировать
- Мобилка получает результат сразу в ответе

**Минусы:**
- Firebase Cloud Functions таймаут (макс 540 сек)
- Если юзер закроет приложение - запрос оборвётся
- Если сеть пропадёт - нужно повторять запрос

**Реализация:**
```typescript
export const generateTaleContent = functions.https.onCall(async (data, context) => {
  await taleRef.update({ completionStatus: FairyTaleStatus.GENERATING });
  
  // Ждём результат от n8n
  const generatedText = await generateStoryWithAI(tale.components, tale.taleStyle);
  
  await taleRef.update({
    taleText: generatedText,
    completionStatus: FairyTaleStatus.COMPLETED,
  });
  
  return { success: true, taleText: generatedText };
});
```

**На мобилке:**
```dart
// Показываем лоадер
showLoader();

// Ждём результат
final result = await generateTaleContent(taleId);

// Скрываем лоадер и показываем сказку
hideLoader();
showTale(result.taleText);
```

---

### Вариант 2: Асинхронный подход (ВЫБРАН)

**Как работает:**
```
Мобилка → generateTaleContent(taleId) → сразу получает { status: 'GENERATING' }
    ↓
Мобилка подписывается на изменения документа в Firestore
    ↓
Бэкенд (в фоне) → n8n → получает taleText → сохраняет в Firestore
    ↓
Мобилка получает обновление через Firestore listener → показывает результат
```

**Подходит для:** генерация > 60 секунд или когда нужна надёжность

**Плюсы:**
- Юзер может закрыть приложение - генерация продолжится
- Нет проблем с таймаутами
- Можно показывать промежуточный статус
- Более надёжно при плохом интернете

**Минусы:**
- Чуть сложнее реализация
- Нужна подписка на Firestore на мобилке

**Реализация на бэкенде:**
```typescript
// 1. Функция вызова генерации (возвращает сразу)
export const generateTaleContent = functions.https.onCall(async (data, context) => {
  await taleRef.update({ completionStatus: FairyTaleStatus.GENERATING });
  
  // Запускаем фоновую генерацию (БЕЗ await!)
  generateAndSave(taleId, tale);
  
  // Сразу возвращаем
  return { 
    success: true, 
    status: FairyTaleStatus.GENERATING 
  };
});

// 2. Фоновая функция генерации
async function generateAndSave(taleId: string, tale: any) {
  const taleRef = db.collection('fairyTales').doc(taleId);
  
  try {
    const generatedText = await generateStoryWithAI(tale.components, tale.taleStyle);
    
    await taleRef.update({
      taleText: generatedText,
      completionStatus: FairyTaleStatus.COMPLETED,
    });
  } catch (error) {
    await taleRef.update({
      completionStatus: FairyTaleStatus.FAILED,
    });
  }
}
```

**На мобилке:**
```dart
// Вызываем генерацию
await generateTaleContent(taleId);

// Показываем лоадер и подписываемся на изменения
FirebaseFirestore.instance
  .collection('fairyTales')
  .doc(taleId)
  .snapshots()
  .listen((snapshot) {
    final status = snapshot.data()?['completionStatus'];
    
    if (status == 'COMPLETED') {
      final taleText = snapshot.data()?['taleText'];
      hideLoader();
      showTale(taleText);
    } else if (status == 'FAILED') {
      hideLoader();
      showError();
    }
    // Если GENERATING - продолжаем показывать лоадер
  });
```

---

## Flow генерации сказки

1. **Создание сказки** (мобилка → `createFairyTale`)
   - Создаётся документ со статусом `DRAFT`
   - `taleText` пустой

2. **Обновление компонентов** (мобилка → `updateFairyTale`)
   - Юзер постепенно заполняет: hero, friends, equipment, villains, places, taleStyle
   - Статус остаётся `DRAFT`

3. **Запуск генерации** (мобилка → `generateTaleContent`)
   - Бэкенд проверяет обязательные поля
   - Меняет статус на `GENERATING`
   - Запускает фоновую генерацию
   - Сразу возвращает ответ мобилке

4. **Фоновая генерация** (бэкенд)
   - Отправляет запрос в n8n с полным JSON (components + taleStyle)
   - Ждёт ответ (может занять несколько минут)
   - Сохраняет `taleText` в Firestore
   - Меняет статус на `COMPLETED` или `FAILED`

5. **Получение результата** (мобилка)
   - Через Firestore listener видит изменение статуса
   - Показывает готовую сказку или ошибку

---

## Обязательные поля для генерации

**Реализовано в коде (валидация в `generateTaleContent`):**
- `hero.name` - обязателен
- `taleStyle.style` - обязателен
- Другие компоненты опциональны (friends, equipment, villains, places)

---

## Реализация - ЗАВЕРШЕНО ✅

### Что сделано:

1. ✅ **Асинхронная генерация реализована**
   - Функция `generateTaleContent` сразу возвращает статус `GENERATING`
   - Фоновая функция `generateAndSave` обрабатывает запрос к n8n
   - Таймаут функции: 540 секунд (9 минут)
   - Таймаут запроса к n8n: 480 секунд (8 минут)

2. ✅ **Валидация полей**
   - Проверка наличия `hero.name`
   - Проверка наличия `taleStyle.style`
   - Ошибка `failed-precondition` если поля не заполнены

3. ✅ **Логирование**
   - Логи перед отправкой в n8n
   - Логи при получении ответа
   - Логи при ошибках

4. ✅ **Обработка ответа от n8n**
   - Парсинг полей: `taleText`, `story`, `text`, `output`
   - Валидация что текст не пустой и является строкой
   - Запись в поле `taleText` в Firestore

5. ✅ **Обработка ошибок**
   - Таймаут запроса
   - Ошибки HTTP
   - Смена статуса на `FAILED` при любой ошибке

### Развернуто в production:
- Первый деплой: 2026-01-03
- Функция: `generateTaleContent`
- Регион: `europe-west1`

---

## Конфигурация

- **Регион Firebase:** `europe-west1`
- **Таймаут функции:** 540 секунд (9 минут)
- **Таймаут запроса к n8n:** 480 секунд (8 минут)
- **n8n webhook URL:** `https://n8n.fairyfy.xyz/webhook/ac502c37-56b8-4241-ba8a-7e82ee932cfb`

---

## API для тестирования

### 1. createFairyTale
**Request:**
```json
{
  "title": "Test Tale",
  "components": {
    "hero": {
      "name": "Knight Arthur",
      "type": "knight"
    },
    "friends": [],
    "equipment": [],
    "villains": [{
      "name": "Dragon",
      "type": "dragon"
    }],
    "places": [{
      "name": "Dark Forest",
      "kind": "forest"
    }]
  },
  "taleStyle": {
    "style": "adventure"
  }
}
```
**Response:**
```json
{
  "success": true,
  "taleId": "abc123xyz",
  "message": "Tale created successfully"
}
```

### 2. generateTaleContent
**Request:**
```json
{
  "taleId": "abc123xyz"
}
```
**Response (немедленно):**
```json
{
  "success": true,
  "status": "GENERATING",
  "message": "Tale generation started"
}
```

### 3. Мониторинг в Firestore
- Открыть Firebase Console → Firestore
- Коллекция: `fairyTales`
- Документ: `{taleId}`
- Следить за полем `completionStatus`:
  - `GENERATING` → обработка
  - `COMPLETED` → смотреть `taleText`
  - `FAILED` → проверить логи

---

## n8n Integration

### Формат запроса в n8n:
```json
{
  "models": {
    "hero": { "name": "...", "type": "..." },
    "friends": [...],
    "equipment": [...],
    "villains": [...],
    "places": [...]
  },
  "taleStyle": {
    "style": "..."
  }
}
```

### Ожидаемый ответ от n8n:
**Формат:** n8n возвращает **массив объектов**
```json
[
  {
    "taleText": "Жил-был одинокий герой..."
  }
]
```

**Поддерживаемые поля** (в порядке приоритета):
- `taleText` (основное поле)
- `story`
- `text`
- `output`

**Обработка в коде:**
1. Проверяется, является ли ответ массивом
2. Если массив - извлекается `result[0].taleText`
3. Если объект (для обратной совместимости) - `result.taleText`
4. Валидация: текст должен существовать и быть строкой

### Обработка результата:
- Успешный ответ → текст записывается в `taleText`, статус → `COMPLETED`
- Ошибка или таймаут → статус → `FAILED`, `taleText` остается пустым

---

## Troubleshooting & Bug Fixes

### Баг: taleText не записывался, статус FAILED (исправлен 04.01.2026)

**Проблема:**
После того как n8n успешно возвращал сгенерированный текст, поле `taleText` оставалось пустым, а `completionStatus` устанавливался в `FAILED`.

**Причина:**
n8n webhook возвращал ответ в формате **массива**:
```json
[
  {
    "taleText": "Жил-был одинокий герой..."
  }
]
```

Но код ожидал объект и пытался извлечь `result.taleText` напрямую из корня. Это возвращало `undefined`, что приводило к ошибке валидации и установке статуса `FAILED`.

**Решение:**
Добавлена проверка типа ответа в функции `generateStoryWithAI`:

```typescript
// Извлечение taleText из ответа
let taleText: string | undefined;

if (Array.isArray(result) && result.length > 0) {
  // Обработка массива: [{"taleText": "..."}]
  taleText = result[0].taleText || result[0].story || result[0].text || result[0].output;
} else {
  // Обратная совместимость с объектом
  taleText = result.taleText || result.story || result.text || result.output;
}
```

**Диагностика:**
1. Добавлено детальное логирование для проверки структуры ответа
2. Проверяли логи Firebase Functions: `firebase functions:log`
3. Тестировали webhook напрямую через `curl`

**Деплой:**
- Дата: 2026-01-04 13:44 UTC
- Команда: `firebase deploy --only functions:generateTaleContent`
- Статус: ✅ Исправлено и работает

**Тестирование:**
После исправления генерация сказок работает корректно:
- Текст сохраняется в `taleText`
- Статус устанавливается в `COMPLETED`

---

## API Endpoints - Полная документация

### Общая информация
- **Production URL:** `https://europe-west1-fairytales-app.cloudfunctions.net`
- **Регион:** `europe-west1`
- **Аутентификация:** Все endpoints требуют Firebase ID Token в header `Authorization: Bearer {token}`
- **Формат:** Firebase Callable Functions (все данные оборачиваются в `{ "data": {...} }`)

---

### 1. createFairyTale

**Назначение:**  
Создает новую сказку в статусе DRAFT (черновик) в Firestore.

**Что происходит на бэкенде:**
1. Проверяется Firebase Authentication (`context.auth`)
2. Валидируются обязательные поля:
   - `title` - не пустая строка
   - `components.hero` - объект с `name` и `type`
   - `taleStyle.style` - не пустая строка
3. Из Firestore читается `userName` текущего пользователя (`users/{userId}`)
4. Создается новый документ в коллекции `fairyTales`:
   - `userId`, `userName` - из auth контекста
   - `title` - название сказки
   - `taleText` - пустая строка (заполнится после генерации)
   - `completionStatus` - устанавливается `DRAFT`
   - `components` - все персонажи, предметы, места
   - `taleStyle` - стиль повествования
   - `createdAt`, `updatedAt` - Firebase Timestamp
5. Возвращается `taleId` для дальнейшего использования

**Request:**
```json
{
  "data": {
    "title": "Великое приключение героев",
    "components": {
      "hero": {
        "name": "Артур",
        "type": "knight"
      },
      "friends": [
        { "name": "Мерлин", "type": "wizard" },
        { "name": "Гвиневра", "type": "princess" }
      ],
      "equipment": [
        { "name": "Экскалибур", "description": "Легендарный меч" }
      ],
      "villains": [
        { "name": "Моргана", "type": "witch" },
        { "name": "Дракон", "type": "dragon" }
      ],
      "places": [
        { "name": "Камелот", "kind": "замок" },
        { "name": "Темный лес", "kind": "лес" }
      ]
    },
    "taleStyle": {
      "style": "Эпическая фэнтези"
    }
  }
}
```

**Response:**
```json
{
  "result": {
    "success": true,
    "taleId": "abc123xyz",
    "message": "Tale created successfully"
  }
}
```

**Важно для мобилки:**
- После создания сказка находится в статусе `DRAFT` и не имеет текста
- Для генерации текста нужно вызвать `generateTaleContent` с полученным `taleId`
- Обязательные поля: `title`, `hero`, `taleStyle`
- Опциональные массивы: `friends`, `equipment`, `villains`, `places` (могут быть пустыми)

---

### 2. generateTaleContent

**Назначение:**  
Запускает асинхронную AI-генерацию текста сказки через n8n webhook.

**Что происходит на бэкенде (пошагово):**
1. Проверяется аутентификация и права доступа (`tale.userId === context.auth.uid`)
2. Читается документ сказки из Firestore по `taleId`
3. Валидируются обязательные поля для генерации:
   - `hero.name` - должен быть заполнен
   - `taleStyle.style` - должен быть заполнен
4. Статус сказки **СРАЗУ** меняется на `GENERATING` в Firestore
5. Функция **НЕМЕДЛЕННО** возвращает ответ клиенту (не ждет генерации!)
6. В **ФОНОВОМ РЕЖИМЕ** запускается функция `generateAndSave()`:
   - Формируется запрос к n8n webhook: `https://n8n.fairyfy.xyz/webhook-test/...`
   - Отправляются данные в формате: `{ models: components, taleStyle: taleStyle }`
   - Ожидается ответ от n8n (timeout 8 минут)
   - Из ответа извлекается `taleText` (или `story`/`text`/`output`)
   - **При успехе:** обновляется `taleText` и статус → `COMPLETED`
   - **При ошибке:** статус → `FAILED`
7. Все обновления пишутся в Firestore (поле `updatedAt` обновляется)

**Request:**
```json
{
  "data": {
    "taleId": "abc123xyz"
  }
}
```

**Response (возвращается СРАЗУ):**
```json
{
  "result": {
    "success": true,
    "status": "GENERATING",
    "message": "Tale generation started"
  }
}
```

**⚠️ КРИТИЧЕСКИ ВАЖНО ДЛЯ МОБИЛЬНОГО ПРИЛОЖЕНИЯ:**

**Этот endpoint возвращает ответ СРАЗУ, не дожидаясь генерации!**

Мобилка **ДОЛЖНА** слушать изменения документа в Firestore через Firebase SDK:

```dart
// 1. Вызвать generateTaleContent
await generateTaleContent(taleId);

// 2. Получить ответ { status: "GENERATING" }

// 3. Подписаться на изменения документа
FirebaseFirestore.instance
  .collection('fairyTales')
  .doc(taleId)
  .snapshots()
  .listen((snapshot) {
    final status = snapshot.data()?['completionStatus'];
    
    if (status == 'COMPLETED') {
      // Генерация завершена успешно
      final taleText = snapshot.data()?['taleText'];
      hideLoader();
      showTale(taleText);
    } else if (status == 'FAILED') {
      // Генерация завершилась с ошибкой
      hideLoader();
      showError('Не удалось сгенерировать сказку');
    } else if (status == 'GENERATING') {
      // Продолжаем показывать loader
      showLoader();
    }
  });
```

**Временные рамки:**
- Генерация может занять от 30 секунд до 8 минут
- Timeout Cloud Function: 540 секунд (9 минут)
- Timeout запроса к n8n: 480 секунд (8 минут)

**Структура документа во время генерации:**
```json
{
  "userId": "user123",
  "userName": "Иван",
  "title": "Великое приключение",
  "taleText": "",
  "completionStatus": "GENERATING",
  "components": { ... },
  "taleStyle": { ... },
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

**После успешной генерации:**
```json
{
  ...
  "taleText": "Давным-давно в королевстве...",
  "completionStatus": "COMPLETED",
  "updatedAt": Timestamp  // Обновлен
}
```

---

### 3. getUserTales

**Назначение:**  
Получает список всех сказок текущего пользователя с поддержкой пагинации.

**Что происходит на бэкенде:**
1. Проверяется аутентификация
2. Выполняется Firestore query:
   - `WHERE userId == context.auth.uid`
   - `ORDER BY createdAt DESC` (сначала новые)
   - `LIMIT` (по умолчанию 20, максимум 50)
3. Если передан `startAfter` - начинается с указанного документа (пагинация)
4. Возвращается массив сказок с полной информацией
5. Дополнительно: `hasMore` (есть ли еще сказки) и `lastId` (для следующей страницы)

**Request:**
```json
{
  "data": {
    "limit": 20
  }
}
```

**Request с пагинацией:**
```json
{
  "data": {
    "limit": 20,
    "startAfter": "lastIdFromPreviousResponse"
  }
}
```

**Response:**
```json
{
  "result": {
    "tales": [
      {
        "id": "tale123",
        "userId": "user456",
        "userName": "Иван",
        "title": "Великое приключение",
        "taleText": "Давным-давно...",
        "completionStatus": "COMPLETED",
        "components": { ... },
        "taleStyle": { "style": "Эпическая фэнтези" },
        "createdAt": { "_seconds": 1704398925, "_nanoseconds": 0 },
        "updatedAt": { "_seconds": 1704399125, "_nanoseconds": 0 }
      }
    ],
    "hasMore": true,
    "lastId": "tale123"
  }
}
```

**Важно для мобилки:**
- Сказки с `completionStatus = DRAFT` имеют пустой `taleText`
- Сказки с `completionStatus = GENERATING` еще генерируются (показать loader)
- Сказки с `completionStatus = COMPLETED` готовы к показу
- Сказки с `completionStatus = FAILED` имеют ошибку генерации
- Для загрузки следующей страницы используйте `lastId` в `startAfter`

---

### 4. updateFairyTale

**Назначение:**  
Обновляет существующую сказку (один или несколько полей).

**Что происходит на бэкенде:**
1. Проверяется аутентификация и права доступа (`tale.userId === context.auth.uid`)
2. Читается текущий документ сказки из Firestore
3. Валидируются переданные поля:
   - `title` - не может быть пустым
   - `taleStyle.style` - не может быть пустым
   - `components.hero` - обязателен (если обновляются components)
4. Формируется объект `updates` с новыми значениями
5. Для `components` применяется частичное обновление:
   - Если передан `hero` - заменяется
   - Если не переданы `friends`/`equipment`/`villains`/`places` - берутся старые значения
6. Обновляется документ в Firestore (`updatedAt` автоматически обновляется)
7. `completionStatus` НЕ меняется (остается прежним)

**Request (полное обновление):**
```json
{
  "data": {
    "taleId": "abc123xyz",
    "title": "Обновленное название",
    "components": {
      "hero": { "name": "Артур Великий", "type": "knight" },
      "friends": [{ "name": "Мерлин", "type": "wizard" }],
      "equipment": [],
      "villains": [{ "name": "Моргана", "type": "witch" }],
      "places": [{ "name": "Камелот", "kind": "замок" }]
    },
    "taleStyle": {
      "style": "Романтическая фэнтези"
    }
  }
}
```

**Request (частичное обновление - только title):**
```json
{
  "data": {
    "taleId": "abc123xyz",
    "title": "Новое название"
  }
}
```

**Request (обновление текста пользователем):**
```json
{
  "data": {
    "taleId": "abc123xyz",
    "taleText": "Отредактированный текст..."
  }
}
```

**Response:**
```json
{
  "result": {
    "success": true,
    "message": "Tale updated successfully"
  }
}
```

**Важно для мобилки:**
- Можно обновить любое поле или несколько полей сразу
- После обновления можно вызвать `generateTaleContent` заново для перегенерации
- Если сказка в статусе `GENERATING` - обновление не рекомендуется
- Частичное обновление: передавайте только те поля, которые нужно изменить

---

### 5. deleteFairyTale

**Назначение:**  
Удаляет сказку из Firestore (необратимая операция).

**Что происходит на бэкенде:**
1. Проверяется аутентификация
2. Читается документ сказки из Firestore по `taleId`
3. Проверяются права доступа (`tale.userId === context.auth.uid`)
4. Документ полностью удаляется из коллекции `fairyTales`
5. Восстановление невозможно

**Request:**
```json
{
  "data": {
    "taleId": "abc123xyz"
  }
}
```

**Response:**
```json
{
  "result": {
    "success": true,
    "message": "Tale deleted successfully"
  }
}
```

**Важно для мобилки:**
- Перед удалением рекомендуется показать confirmation dialog
- После успешного удаления обновить список сказок
- Если пользователь слушал этот документ через `onSnapshot` - он получит `null`

---

### Типы данных

**EntityType (доступные типы персонажей):**
- `knight` - рыцарь
- `wizard` - волшебник
- `princess` - принцесса
- `fairy` - фея
- `dragon` - дракон
- `witch` - ведьма

**FairyTaleStatus (статусы сказки):**
- `DRAFT` - черновик (создана, но не генерировалась)
- `GENERATING` - в процессе AI-генерации (фоновая задача работает)
- `COMPLETED` - генерация завершена успешно (`taleText` заполнен)
- `FAILED` - генерация завершилась с ошибкой (`taleText` пустой)

**Структура компонентов:**
```typescript
components: {
  hero: { name: string, type: EntityType },           // Обязательный
  friends: [{ name: string, type: EntityType }],      // Массив
  equipment: [{ name: string, description?: string }], // Массив
  villains: [{ name: string, type: EntityType }],     // Массив
  places: [{ name: string, kind: string }]            // Массив
}
```

---

### Firebase Errors

Возможные ошибки от Cloud Functions:

- `unauthenticated` - пользователь не авторизован (нет/невалидный токен)
- `invalid-argument` - неверные параметры запроса (валидация не прошла)
- `not-found` - сказка или пользователь не найдены
- `permission-denied` - нет прав доступа (не владелец сказки)
- `failed-precondition` - не выполнены предусловия (нет hero/taleStyle для генерации)

---

### Рекомендуемый Flow для создания сказки

1. **Пользователь заполняет форму**  
   - title, hero, friends, villains, places, taleStyle

2. **Вызов `createFairyTale`**  
   - Получаем `taleId` в ответе

3. **Вызов `generateTaleContent`**  
   - Сразу вызываем с полученным `taleId`
   - Получаем ответ `{ status: "GENERATING" }`

4. **Показываем UI с loader**  
   - Индикатор загрузки
   - Опционально: прогресс-бар или анимация

5. **Подписка на Firestore listener**  
   - `db.collection('fairyTales').doc(taleId).onSnapshot()`
   - Слушаем изменения поля `completionStatus`

6. **Обработка результата**  
   - `COMPLETED` → скрыть loader, показать текст сказки
   - `FAILED` → скрыть loader, показать ошибку с кнопкой "Попробовать снова"

---

### n8n Integration Details

**Webhook URL:**  
`https://n8n.fairyfy.xyz/webhook-test/ac502c37-56b8-4241-ba8a-7e82ee932cfb`

**Формат запроса к n8n:**
```json
{
  "models": {
    "hero": { "name": "...", "type": "..." },
    "friends": [...],
    "equipment": [...],
    "villains": [...],
    "places": [...]
  },
  "taleStyle": {
    "style": "..."
  }
}
```

**Ожидаемый ответ от n8n (массив):**
```json
[
  {
    "taleText": "Жил-был одинокий герой..."
  }
]
```

**Поддерживаемые поля ответа:**  
(в порядке приоритета)
- `taleText` (основное поле)
- `story`
- `text`
- `output`

**Обработка в коде:**
1. Проверяется, является ли ответ массивом
2. Если массив - извлекается `result[0].taleText`
3. Если объект (для обратной совместимости) - `result.taleText`
4. Валидация: текст должен существовать и быть строкой

---
