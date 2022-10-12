#!/bin/sh

ENV_FILE=$1
export REDIS_HOST=$(grep REDIS_HOST $ENV_FILE | cut -d '=' -f2)

echo ENV VARS : REDIS_HOST=$REDIS_HOST
node dist/main.js
