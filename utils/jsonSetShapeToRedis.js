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
const shapeFiles = ['./tests/paris.json', './tests/montreal.json'];

async function publishToChannel() {
    var res = await client.publish("ShapeChanged", "LIMIT");
    console.log("publishToChannel returned " + res);
}

const run = async () => {
    await client.connect();
    await client.ping();

    var results = [];
    var shapeKeys = [];
    for (const shapeFile of shapeFiles) {
        console.log("Loading shape from " + shapeFile);
        const shape = fs.readFileSync(shapeFile, {encoding:'utf8', flag:'r'});
        const shape1 = shape.replaceAll("\\\\\\", "").replaceAll("\\\\", "").replaceAll("\\", "")
            .replaceAll("\r", "").replaceAll("\n", "").replaceAll("\t", "");
        const shape2 = shape1.replaceAll("        ", " ").replaceAll("       ", " ").replaceAll("      ", " ")
            .replaceAll("     ", " ").replaceAll("    ", " ").replaceAll("   ", " ").replaceAll("  ", " ");
        const json = JSON.parse(shape2);
        const key = 'SHAPELOC:' + json.shapeId;
        shapeKeys.push(key);

        var res = await client.json.set(key, '$', json)
            .catch((err) => console.log(`createShape failed for ${key} -> ${err}`));
        console.log("json.set returned " + res);
        results.push(res);
    }

    for (const key of shapeKeys) {
        console.log("Loading shape from redis " + key);
        var res = await client.json.get(key, '$')
            .catch((err) => console.log(`getShape failed for ${key} -> ${err}`));
        console.log(JSON.stringify(res));
    }

    await publishToChannel();

    for (const result in results)
        if (result != "OK")
            process.exit(1);
    process.exit(0);
}

run();
