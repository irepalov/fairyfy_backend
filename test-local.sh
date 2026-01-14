#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:5001/fairytales-app/europe-west1"

echo -e "${BLUE}=== Тест 1: Создание сказки ===${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/createFairyTale" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Приключения храброго рыцаря",
      "components": {
        "hero": {
          "name": "Артур",
          "type": "knight"
        },
        "friends": [
          {
            "name": "Мерлин",
            "type": "wizard"
          }
        ],
        "equipment": [
          {
            "name": "Экскалибур",
            "description": "Легендарный меч"
          }
        ],
        "villains": [
          {
            "name": "Моргана",
            "type": "witch"
          }
        ],
        "places": [
          {
            "name": "Камелот",
            "kind": "замок"
          }
        ]
      }
    }
  }')

echo "$CREATE_RESPONSE" | jq '.'

# Извлечь taleId из ответа
TALE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.taleId')

if [ "$TALE_ID" != "null" ] && [ -n "$TALE_ID" ]; then
  echo -e "${GREEN}Tale ID: $TALE_ID${NC}"
  
  echo -e "\n${BLUE}=== Тест 2: Генерация текста сказки ===${NC}"
  curl -s -X POST "$BASE_URL/generateTaleContent" \
    -H "Content-Type: application/json" \
    -d "{
      \"data\": {
        \"taleId\": \"$TALE_ID\"
      }
    }" | jq '.'
  
  echo -e "\n${BLUE}=== Тест 3: Получение списка сказок ===${NC}"
  curl -s -X POST "$BASE_URL/getUserTales" \
    -H "Content-Type: application/json" \
    -d '{
      "data": {
        "limit": 10
      }
    }' | jq '.'
else
  echo "Ошибка: не удалось создать сказку"
fi
