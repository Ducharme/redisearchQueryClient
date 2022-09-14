const redis = require("redis");

const params = {
  'socket': {
      'host': process.env.REDIS_HOST || "localhost", //redisearch-service
      'port': process.env.REDIS_PORT || 6379,
      reconnectStrategy: (retries) => { return 5000; }
  }
};
const client = redis.createClient(params);
client.on("error", function(error) { console.error("Err -> " + error); });

const run = async () => {
    var c = await client.connect().catch(err => console.log(err));
    console.log(c);

    var p = await client.ping().catch(err => console.log(err));
    console.log(p);

    var result = await client.ft.create('idx:animals', {
      name: {
        type: redis.SchemaFieldTypes.TEXT,
        sortable: true
      },
      species: redis.SchemaFieldTypes.TAG,
      age: redis.SchemaFieldTypes.NUMERIC
    }, {
      ON: 'HASH',
      PREFIX: 'noderedis:animals'
    });
    console.log(result);

    if (result != "OK")
        process.exit(1);
    process.exit(0);
}

run();
