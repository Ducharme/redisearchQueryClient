const redis = require("redis");

const params = {
    'socket': {
        'host': process.env.REDIS_HOST || "localhost",
        'port': process.env.REDIS_PORT || 6379
    }
};
const client = redis.createClient(params);
client.on("error", function(error) { console.error(error); });

const streamIds = ["STREAMDEV:device1", "STREAMDEV:device2"];
const streamValues = ["randomValue1", "randomValue2"];

async function publishToStream() {

    for (const streamId of streamIds) {
        const indexOf = streamIds.indexOf(streamId);
        const key = streamValues[indexOf];
        const val = Math.random().toString();
        var res = await client.xAdd(streamId, "*", key, val);
        console.log(`Result #${indexOf}: ${res}`);
    }
}

const run = async () => {
    await redisClient.connect();
    await redisClient.ping();

    setInterval(publishToStream, 1000);
}

run();