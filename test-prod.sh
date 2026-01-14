#!/bin/bash

# Инструкции:
# 1. Получите ID token (см. инструкцию ниже)
# 2. Замените YOUR_ID_TOKEN на реальный токен
# 3. Запустите: chmod +x test-prod.sh && ./test-prod.sh

ID_TOKEN="YOUR_ID_TOKEN"
BASE_URL="https://europe-west1-fairytales-app.cloudfunctions.net"

if [ "$ID_TOKEN" = "YOUR_ID_TOKEN" ]; then
  echo "❌ Замените YOUR_ID_TOKEN на реальный токен!"
  echo ""
  echo "Как получить токен:"
  echo "1. Установите зависимости: cd .. && npm install firebase-admin"
  echo "2. Скачайте serviceAccountKey.json из Firebase Console"
  echo "3. Получите Web API Key из Firebase Console -> Project Settings"
  echo "4. Обновите test-production.js (строка 22)"
  echo "5. Запустите: node test-production.js YOUR_USER_UID"
  exit 1
fi

echo "🚀 Тестирование Production API"
echo "================================"

# 1. Создать сказку
echo -e "\n📝 Создание сказки..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/createFairyTale" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{
    "data": {
      "title": "Приключения храброго рыцаря",
      "components": {
        "hero": { "name": "Артур", "type": "knight" },
        "friends": [{ "name": "Мерлин", "type": "wizard" }],
        "equipment": [{ "name": "Экскалибур", "description": "Легендарный меч" }],
        "villains": [{ "name": "Моргана", "type": "witch" }],
        "places": [{ "name": "Камелот", "kind": "замок" }]
      }
    }
  }')

echo "$CREATE_RESPONSE" | jq '.'

TALE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.taleId')

if [ "$TALE_ID" != "null" ] && [ -n "$TALE_ID" ]; then
  echo "✅ Tale ID: $TALE_ID"
  
  # 2. Сгенерировать текст сказки
  echo -e "\n🎨 Генерация текста сказки..."
  curl -s -X POST "$BASE_URL/generateTaleContent" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -d "{
      \"data\": {
        \"taleId\": \"$TALE_ID\"
      }
    }" | jq '.'
  
  # 3. Получить список сказок
  echo -e "\n📚 Получение списка сказок..."
  curl -s -X POST "$BASE_URL/getUserTales" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -d '{
      "data": {
        "limit": 10
      }
    }' | jq '.'
  
  # 4. Удалить сказку (опционально)
  # echo -e "\n🗑️  Удаление сказки..."
  # curl -s -X POST "$BASE_URL/deleteFairyTale" \
  #   -H "Content-Type: application/json" \
  #   -H "Authorization: Bearer $ID_TOKEN" \
  #   -d "{
  #     \"data\": {
  #       \"taleId\": \"$TALE_ID\"
  #     }
  #   }" | jq '.'
else
  echo "❌ Ошибка: не удалось создать сказку"
fi

echo -e "\n✅ Тестирование завершено!"
