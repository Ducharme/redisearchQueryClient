const redis = require("redis");
const h3 = require("h3-js");
const { Device } = require("./device");

// https://redis.io/commands/hgetall/
// HGETALL DEVLOC:test-001:lafleet/devices/location/+/streaming

// https://redis.io/commands/xread/
// XRANGE STREAMDEV:test-001:lafleet/devices/location/+/streaming - +
// XREAD BLOCK 2000 COUNT 1 STREAMS STREAMDEV:test-001:lafleet/devices/location/+/streaming $


const params = {
    'socket': {
        'host': process.env.REDIS_HOST || "localhost",
        'port': process.env.REDIS_PORT || 6379
    }
};
const client = redis.createClient(params);
client.on("error", function(error) { console.error(error); });

const topic = "lafleet/devices/location/+/streaming";
var device1 = new Device(1);
var device2 = new Device(2);
var device3 = new Device(3);

async function publishToRedis() {
    publishToRedisForDevice(device1);
    publishToRedisForDevice(device2);
    publishToRedisForDevice(device3);
}

async function publishToRedisForDevice(device) {
    
    device.MoveRandomly();
    const gps_lat = device.latitude;
    const gps_lng = device.longitude;
    const gps_alt = device.altitude;

    var key = `DEVLOC:${device.deviceId}:${topic}`;
    var lnglat = gps_lng.toFixed(11) + "," + gps_lat.toFixed(11);

    var h3r0 = h3.geoToH3(gps_lat, gps_lng, 0);
    var h3r1 = h3.geoToH3(gps_lat, gps_lng, 1);
    var h3r2 = h3.geoToH3(gps_lat, gps_lng, 2);
    // 822b87fffffffff","822baffffffffff
    if (device.deviceId == "test-001")
        h3r2 = "822b87fffffffff";
    else if (device.deviceId == "test-002")
        h3r2 = "822baffffffffff";
    else
        h3r2 = "822bafffffffffe";
    
    var h3r3 = h3.geoToH3(gps_lat, gps_lng, 3);
    var h3r4 = h3.geoToH3(gps_lat, gps_lng, 4);
    var h3r5 = h3.geoToH3(gps_lat, gps_lng, 5);
    var h3r6 = h3.geoToH3(gps_lat, gps_lng, 6);
    var h3r7 = h3.geoToH3(gps_lat, gps_lng, 7);
    var h3r8 = h3.geoToH3(gps_lat, gps_lng, 8);
    var h3r9 = h3.geoToH3(gps_lat, gps_lng, 9);
    var h3r10 = h3.geoToH3(gps_lat, gps_lng, 10);
    var h3r11 = h3.geoToH3(gps_lat, gps_lng, 11);
    var h3r12 = h3.geoToH3(gps_lat, gps_lng, 12);
    var h3r13 = h3.geoToH3(gps_lat, gps_lng, 13);
    var h3r14 = h3.geoToH3(gps_lat, gps_lng, 14);
    var h3r15 = h3.geoToH3(gps_lat, gps_lng, 15);

    var payload1 = {
      'deviceId': device.deviceId, 'topic': topic,
      'lnglat': lnglat, 'lng': gps_lng, 'lat': gps_lat, 'alt': gps_alt,
      'dts': device.dev_ts, 'sts': device.srv_ts, 'wts': device.wrk_ts,
      'fv': device.firmwareVersion, 'batt': device.battery, 'seq': device.seq,
      'h3r0': h3r0, 'h3r1': h3r1, 'h3r2': h3r2, 'h3r3': h3r3, 'h3r4': h3r4, 'h3r5': h3r5, 
      'h3r6': h3r6, 'h3r7': h3r7, 'h3r8': h3r8, 'h3r9': h3r9, 'h3r10': h3r10,
      'h3r11': h3r11, 'h3r12': h3r12, 'h3r13': h3r13, 'h3r14': h3r14, 'h3r15': h3r15
    };

    // "STREAMDEV:test-299212:lafleet/devices/location/+/streaming"
    var sk = key.replace("DEVLOC", "STREAMDEV");
    var payload2 = {
        'dts': device.dev_ts.toString(), // TODO: remove .toString() when bug is fixed
        'sts': device.srv_ts.toString(), // TODO: remove .toString() when bug is fixed
        'wts': device.wrk_ts.toString(), // TODO: remove .toString() when bug is fixed
        'rts': Date.now().toString(), // TODO: remove .toString() when bug is fixed
        'seq': device.seq.toString(), // TODO: remove .toString() when bug is fixed
        'lng': gps_lng.toString(), // TODO: remove .toString() when bug is fixed
        'lat': gps_lat.toString(), // TODO: remove .toString() when bug is fixed
        'alt': gps_alt.toString(), // TODO: remove .toString() when bug is fixed
        'h3r15': h3r15
    };

    let handleError1 = (error) => {
        console.error(`Failed to hSet key ${key} with payload ${JSON.stringify(payload1)}. ${error}`);
        throw "Failed to hSet " + key;
    };

    let handleError2 = (error) => {
        console.error(`Failed to xAdd key ${sk} with payload ${JSON.stringify(payload2)}. ${error}`);
        throw "Failed to xAdd " + sk;
    };

    var promise1 = client.hSet(key, payload1).catch(handleError1);

    var promise2 = client.xAdd(sk, "*", payload2).catch(handleError2);
    return promise1.then(promise2)
        .then(() => {
            console.log("Redis updated successfully");
            return "Success";
        }).catch((err) => {
            console.log("Redis failed to get updated");
            return "Failure";
        });
}

const run = async () => {
    await client.connect();
    await client.ping();

    setInterval(publishToRedis, 10000);
}

run();