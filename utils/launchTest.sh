#!/bin/sh

sh utils/startRedisLocally.sh
sleep 1

### Upload shapes

node utils/jsonSetShapeToRedis.js
sleep 1

### Start streaming device locations

node utils/streamDevLocToRedis.js &
sleep 1

### Start server

export SERVER_PORT=6262
export REDIS_HOST=localhost

echo ENV VARS : REDIS_HOST=$REDIS_HOST
node dist/main.js &
sleep 5

### Query server endpoint

curl -X POST -H "Content-Type: application/json" -d '{"shapeType":"LIMIT","status":"ACTIVE","h3indices":["812bbffffffffff"]}' http://localhost:$SERVER_PORT/h3/search/shapes/list
sleep 1
