
docker stop `docker ps | grep "redislabs/redisearch:latest" | head -n 1 | tr -s ' ' | cut -d " " -f 1`

kill `ps aux --sort=-%mem | grep "node utils/streamDevLocToRedis.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2`

kill `ps aux --sort=-%mem | grep "node dist/main.js" | head -n 1 | tr -s ' ' | cut -d " " -f 2`
