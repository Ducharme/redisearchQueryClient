#!/bin/sh

# DOCKER_ID=$(docker ps | grep "redislabs/redisearch:latest" | head -n 1 | tr -s ' ' | cut -d " " -f 1)
# if [ ! -z "$DOCKER_ID" ]; then docker stop `$DOCKER_ID`; fi

# PROC_ID=$(ps aux --sort=-%mem | grep "node utils/streamDevLocToRedis.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2)
# if [ ! -z "$PROC_ID" ]; then kill `$PROC_ID`; fi

# PROC_ID=$(ps aux --sort=-%mem | grep "node utils/streamRandToRedis.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2)
# if [ ! -z "$PROC_ID" ]; then kill `$PROC_ID`; fi

# PROC_ID=$(ps aux --sort=-%mem | grep "node dist/main.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2)
# if [ ! -z "$PROC_ID" ]; then kill `$PROC_ID`; fi

docker stop `docker ps | grep "redislabs/redisearch:latest" | head -n 1 | tr -s ' ' | cut -d " " -f 1`
kill `ps aux --sort=-%mem | grep "node utils/streamDevLocToRedis.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2`
#kill `ps aux --sort=-%mem | grep "node utils/streamRandToRedis.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2`
kill `ps aux --sort=-%mem | grep "node dist/main.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2`

echo "DONE!"
