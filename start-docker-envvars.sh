#!/bin/sh

ENV_FILE=$1
export REDIS_HOST=$(grep REDIS_HOST $ENV_FILE | cut -d '=' -f2)

sudo docker run -it redisearch-client:v0.02 --env REDIS_HOST=$REDIS_HOST
