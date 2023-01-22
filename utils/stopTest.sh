#!/bin/sh

CONTAINER_ID=$(docker ps | grep "redislabs/redisearch:latest" | awk '{print $1}')
if [ ! -z "$CONTAINER_ID" ]; then docker stop $CONTAINER_ID; fi

PROC_ID=$(ps -ef | grep "node" | grep "utils/streamDevLocToRedis.js" | awk '{print $2}')
if [ ! -z "$PROC_ID" ]; then kill $PROC_ID; fi

PROC_ID=$(ps -ef | grep "node" | grep "utils/main.js" | awk '{print $2}')
if [ ! -z "$PROC_ID" ]; then kill $PROC_ID; fi
