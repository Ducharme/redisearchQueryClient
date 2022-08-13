const redis = require("redis");

// https://redis.io/commands/subscribe/
// REDIS COMMAND -> SUBSCRIBE ShapeChanged

const params = {
    'socket': {
        'host': process.env.REDIS_HOST || "localhost",
        'port': process.env.REDIS_PORT || 6379
    }
};

const client = redis.createClient(this.params);
client.on("error", function(error) { console.error(error); });

async function publishToChannel() {
    var res = await client.publish("ShapeChanged", "LIMIT");
    console.log("Result: " + res);
}

const run = async () => {
    await redisClient.connect();
    await redisClient.ping();

    setInterval(publishToChannel, 10000);
}

run();