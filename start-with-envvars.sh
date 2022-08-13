#!/bin/sh

ENV_FILE=$1
export REDIS_HOST=$(grep REDIS_HOST $ENV_FILE | cut -d '=' -f2)
export AWS_REGION=$(grep AWS_REGION $ENV_FILE | cut -d '=' -f2)


echo ENV VARS : REDIS_HOST=$REDIS_HOST AWS_REGION=$AWS_REGION
node dist/main.js
