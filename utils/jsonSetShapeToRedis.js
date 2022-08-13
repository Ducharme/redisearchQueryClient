const redis = require("redis");
const fs = require('fs');

// https://redis.io/commands/json.get/
// REDIS COMMAND -> JSON.GET SHAPELOC:4308c950-9d3c-4ba3-ace0-a54c1f279058

const params = {
  'socket': {
      'host': process.env.REDIS_HOST || "localhost",
      'port': process.env.REDIS_PORT || 6379
  }
};
const client = redis.createClient(params);
client.on("error", function(error) { console.error(error); });


const run = async () => {
    //const file = '/home/claude/GitHub3/sqsShapeConsumerToRedisearch/tests/montreal.json';
    //const key = 'SHAPELOC:47db1f7b-5c0f-4f85-88d7-2bc3f83eaaf4';
    const file = '/home/claude/GitHub3/sqsShapeConsumerToRedisearch/tests/paris.json';
    const key = 'SHAPELOC:4308c950-9d3c-4ba3-ace0-a54c1f279058';
    const shape = fs.readFileSync(file, {encoding:'utf8', flag:'r'});

    var res = await this.client.json.set(key, '$', shape)
        .catch((err) => console.log(`createShape failed for ${key} -> ${err}`));
    console.log("Result: " + res);
}

run();