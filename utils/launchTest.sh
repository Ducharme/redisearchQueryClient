#!/bin/sh

REDIS_WHICH=$(which redis-cli)
if [ -z "$REDIS_WHICH" ]; then
  echo "redis-cli is needed to launch the tests. You can run 'sudo apt install redis-tools' to install it"
  exit 1
fi

NODE_WHICH=$(which node)
if [ -z "$NODE_WHICH" ]; then
  echo "node is needed to launch the tests. You can use nvm to install it."
  echo "See https://github.com/Ducharme/infraAsCodeCdk/blob/main/README.md#nodejs"
  exit 2
fi

CURL_WHICH=$(which curl)
if [ -z "$CURL_WHICH" ]; then
  echo "curl is needed to launch the tests. You can run 'sudo apt install curl' install it."
  exit 3
fi

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

curl -X POST -H "Content-Type: application/json" -d '{"shapeType":"LIMIT","status":"ACTIVE","h3indices":["802bfffffffffff"]}' http://localhost:$SERVER_PORT/h3/search/shapes/list
sleep 5

curl -X POST -H "Content-Type: application/json" -d '{"h3resolution":"0","h3indices":["802bfffffffffff"]}' http://localhost:$SERVER_PORT/h3/aggregate/devices/count
sleep 1
