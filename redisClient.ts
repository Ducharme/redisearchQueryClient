//import { commandOptions } from "redis";
import { AggregateGroupByReducers, AggregateSteps } from "redis";
import { ShapeArray } from "./shapeTypes";
const redis = require("redis");
//const h3 = require("h3-js");

const topic = "lafleet/devices/location/+/streaming";
const REDIS_LIMIT_OFFSET = 0;
const REDIS_LIMIT_COUNT = 250;

export class redisClient {
    private readonly params = {
        'socket': {
            'host': process.env.REDIS_HOST || "localhost",
            'port': process.env.REDIS_PORT || 6379
        }
    };
    private readonly client = redis.createClient(this.params);
    private subscriber: any;
    private readonly shapeChangedChannel = "ShapeChanged";
    //private readonly "STREAMDEV:claude" = "STREAMDEV:";

    constructor() {
        this.client.on("connect", () => {
            console.log('Redis client connected');
        });
        this.client.on("ready", () => {
            console.log('Redis client ready');
        });
        this.client.on("end", () => {
            console.log('Redis client disconnected');
        });
        this.client.on("reconnecting", () => {
            console.log('Redis client reconnecting');
        });
        this.client.on("error", function(error: any) {
            console.error(error);
        });
    }

    public async connect() {
        await this.client.connect();
    }

    public async ping() {
        await this.client.ping();
    }

    public async subscribe(callback: Function) {
        this.subscriber = this.client.duplicate();
        await this.subscriber.connect();
        await this.subscriber.subscribe(this.shapeChangedChannel, (message: string) => {
            console.log(`Message received on channel ${this.shapeChangedChannel}: ${message}`);
            callback(message); // callback function expected ShapeType string as single argument
        });
    }

    public async getShapeType(type: string) : Promise<ShapeArray> {
        console.log(`Getting list of ${type} from redis.`);
        const indexName = 'shape-type-idx';
        const filter = `@type:(${type})`;
        const retArr = ['$.shapeId', 'AS', 'shapeId', '$.name', 'AS', 'name', '$.status', 'AS', 'status'];
        console.debug(`Query => FT.SEARCH ${indexName} ${filter} RETURN ${retArr.length} ${retArr.join(" ")}`);
        
        var response = await this.client.ft.search(indexName, filter, { RETURN: retArr })
        console.log(`Getting list of ${type} from redis succeeded. Total of ${response.total} shapes found.`);
        return response.documents as ShapeArray;
    }

    public async getAllStreamKeys() {
        //SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]
        //SCAN 0 MATCH STREAMDEV:* TYPE stream
        const filter = { TYPE: 'stream', MATCH: 'STREAMDEV:*', COUNT: 20 };

        var keys : string[] = [];
        for await (const key of this.client.scanIterator(filter)) {
            keys.push(key);
        }
        return keys;
    }

    public async subscribeToStreamKey(key: string, callback: Function) {
        while (true) {
            try {
                let response = await this.client.xRead(
                    //commandOptions( { isolated: true }),
                    [{ key: key, id: '$' }],
                    //{ COUNT: 6, BLOCK: 500 }
                    { COUNT: 1, BLOCK: 100 }
                );
                
                if (response) {
                    // Response is an array of streams, each containing an array of entries:
                    // [
                    //   {
                    //     "name": "mystream",
                    //     "messages": [
                    //       {
                    //         "id": "1642088708425-0",
                    //         "message": {
                    //           "num": "999"
                    //         }
                    //       }
                    //     ]
                    //   }
                    // ]
                    const msg = JSON.stringify(response[0].messages[0].message);
                    callback(response[0].name, msg);
                } else {
                    // Response is null, we have read everything that is in the stream right now...
                    //console.log('No new stream entries.');
                }
            } catch (err) {
                console.error(err);
            }
        }
    }

    // TODO: New streams will be missing if created after the subscription
    public async subscribeToAllStreams(callback: Function) {
        var keys = await this.getAllStreamKeys();
        for (const key of keys) {
            this.subscribeToStreamKey(key, callback);
        }
    }

    public async aggregate(h3resolution: number, h3indices : string[]) {
      //FT.AGGREGATE topic-h3-idx "@topic:topic_1 @h3r0:{802bfffffffffff | 802bffffffffffw }" GROUPBY 1 @h3r0 REDUCE COUNT 0 AS num_devices
      var h3res = "@h3r" + h3resolution;
      var h3filter = h3res + ":{ " + h3indices.join(" | ") + " }";
      var filter = "@topic:" + topic + " " + h3filter;
      const indexName = 'topic-h3-idx';
      //var agg = await redisClient.call('FT.AGGREGATE', 'topic-h3-idx', filter, 'GROUPBY', 1, h3res, "REDUCE", "COUNT", 0, "AS", "num_devices",
      var query = ['FT.AGGREGATE', indexName, filter, 'GROUPBY', 1, h3res, "REDUCE", "COUNT", 0, "AS", "num_devices"].join(" ");
      console.log("Query => " + query);
      
      var agg = await this.client.ft.aggregate(indexName, filter, {
        STEPS: [{
          type: AggregateSteps.GROUPBY,
          REDUCE: [{
            type: AggregateGroupByReducers.COUNT,
            property: h3res,
            AS: 'num_devices'
          }]
        }]
      });
      //[ 'h3r0', '80d5fffffffffff', 'num_devices', '3' ]
      return agg;
    }

    public async search (longitude: number, latitude : number, distance: number, distanceUnit: string) {
        //var results : string[] = [];

        //FT.SEARCH topic-lnglat-idx "@topic:topic_1 @lnglat:[-73 45 100 km]" NOCONTENT
        //var list = await redisClient.call('FT.SEARCH', 'topic-lnglat-idx', filter, 'NOCONTENT', 'LIMIT', REDIS_LIMIT_OFFSET, REDIS_LIMIT_COUNT,
        var lnglatFilter = `@lnglat:[ ${longitude} ${latitude} ${distance} ${distanceUnit} ]`;
        var filter = "@topic:" + topic + " " + lnglatFilter;
        const indexName = 'topic-lnglat-idx';
        console.log("Filter = " + filter);
        
        
        var list = await this.client.ft.search(indexName, filter, {
            //NOCONTENT, // TODO: https://github.com/redis/node-redis/blob/master/packages/search/lib/commands/SEARCH.ts#L10
            LIMIT: { from: REDIS_LIMIT_OFFSET, size: REDIS_LIMIT_COUNT }
        });
        // 1) (integer) 23
        // 2) "DEVLOC:test-10247715:topic_1"
        return list;
    }

    /*public async getShapeLocation(jsonStr: string): Promise<string> {
        const json = JSON.parse(jsonStr);
        var deviceId = json.deviceId;
        var dev_ts = json.timestamp;
        var srv_ts = json.server_timestamp;
        var wrk_ts = Date.now();
        var fv = json.firmwareVersion.split(".").join("_");
        var batt = json.battery;
        var gps_lat = json.gps_lat;
        var gps_lng = json.gps_lng;
        var gps_alt = json.gps_alt;
        var lnglat = gps_lng.toFixed(11) + "," + gps_lat.toFixed(11)
        
        var h3r0 = h3.geoToH3(gps_lat, gps_lng, 0);
        var h3r1 = h3.geoToH3(gps_lat, gps_lng, 1);
        var h3r2 = h3.geoToH3(gps_lat, gps_lng, 2);
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
    
        var topic = json.topic;
        var seq = json.seq;

        var key : string = `DEVLOC:${deviceId}:${topic}`;
        var payload1 = {
          'deviceId': deviceId, 'topic': topic,
          'lnglat': lnglat, 'lng': gps_lng, 'lat': gps_lat, 'alt': gps_alt,
          'dts': dev_ts, 'sts': srv_ts, 'wts': wrk_ts, 'fv': fv, 'batt': batt, 'seq': seq,
          'h3r0': h3r0, 'h3r1': h3r1, 'h3r2': h3r2, 'h3r3': h3r3, 'h3r4': h3r4, 'h3r5': h3r5, 
          'h3r6': h3r6, 'h3r7': h3r7, 'h3r8': h3r8, 'h3r9': h3r9, 'h3r10': h3r10,
          'h3r11': h3r11, 'h3r12': h3r12, 'h3r13': h3r13, 'h3r14': h3r14, 'h3r15': h3r15
        };

        // "STREAMDEV:test-299212:lafleet/devices/location/+/streaming"
        var sk = key.replace("DEVLOC", "STREAMDEV");
        // BUG: In version 4.2.0 sending integer with fail with TypeError: Invalid argument type
        //var payload2 = {'dts': dev_ts, 'sts': srv_ts, 'wts': wrk_ts, 'rts': Date.now(), 'seq': seq};
        var payload2 = {'dts': dev_ts.toString(), 'sts': srv_ts.toString(),
            'wts': wrk_ts.toString(), 'rts': Date.now().toString(), 'seq': seq.toString()};
        

        let handleError1 = (error: any) => {
            console.error(`Failed to hSet key ${key} with payload ${JSON.stringify(payload1)}. ${error}`);
            throw "Failed to hSet " + key;
        };

        let handleError2 = (error: any) => {
            console.error(`Failed to xAdd key ${sk} with payload ${JSON.stringify(payload2)}. ${error}`);
            throw "Failed to xAdd " + sk;
        };

        var promise1 = this.client.hSet(key, payload1).catch(handleError1);
        var promise2 = this.client.xAdd(sk, "*", payload2).catch(handleError2);
        return promise1.then(promise2)
            .then(() => {
                console.log("Redis updated successfully");
                return "Success";
            }).catch((err: any) => {
                console.log("Redis failed to get updated");
                return "Failure";
            });
    }*/
}
