import { AggregateGroupByReducers, AggregateSteps } from "redis";
import { BaseShapeArray, H3PolygonShape, H3PolygonShapeArray, H3PolygonShapeKvp, PolygonShape, PolygonShapeArray, PolygonShapeKvp, Shape, ShapeType } from "./shapeTypes";
import union from "@turf/union";
import intersect from "@turf/intersect";
import { Feature, MultiPolygon, Polygon, Position, polygon } from "@turf/turf";
import { StreamDev, StreamDevLocationUpdate } from "./deviceTypes";
const redis = require("redis");
const h3 = require("h3-js");


const topic = "lafleet/devices/location/+/streaming";
const REDIS_LIMIT_OFFSET = 0;
const REDIS_LIMIT_COUNT = 250;

export interface IResults {
    [h3index:string]: number;
}

interface xReadMessage {
    id: string;
    message: StreamDev;
}

interface xReadMessages {
    name: string;
    messages: xReadMessage[];
}

type xReadResponse = xReadMessages[];

type xRevRangeResponse = xReadMessage[];

export const unique = (arr: string[]) => [...new Set(arr)];

export class redisClient {

    private readonly params = {
        'socket': {
            'host': process.env.REDIS_HOST || "localhost",
            'port': process.env.REDIS_PORT || 6379
        }
    };
    private readonly client = redis.createClient(this.params);
    private shapeChangedSubscriber: any;
    static readonly shapeChangedChannel = "ShapeChanged";
    static readonly shapeLocKeyPrefix = "SHAPELOC:";
    private readonly timerScanForStreams : NodeJS.Timeout;
    private readonly currentStreams : string[] = [];
    private streamAddedHandler: (streamId: string) => void = () => {};
    private streamRemovedHandler: (streamId: string) => void = () => {};
    private readonly cacheLastValues = new Map<string, StreamDevLocationUpdate>();

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

        this.timerScanForStreams = setInterval(() => { this.scanForStreams(); }, 10*1000);
    }

    public assignAddedHandler (handler: (streamId: string) => void) {
        this.streamAddedHandler = handler;
    }

    public assignRemovedHandler (handler: (streamId: string) => void) {
        this.streamRemovedHandler = handler;
    }

    public async connect() {
        await this.client.connect();
    }

    public async ping() {
        await this.client.ping();
    }

    public async subscribe(callback: (message: string) => {}) {
        this.shapeChangedSubscriber = this.client.duplicate();
        await this.shapeChangedSubscriber.connect();
        await this.shapeChangedSubscriber.subscribe(redisClient.shapeChangedChannel, (message: string) => {
            console.log(`Message received on channel ${redisClient.shapeChangedChannel}: ${message}`);
            callback(message); // callback function expected ShapeType string as single argument
        });
    }

    private async scanForStreams() {
        console.log("scanForStreams() begins");
        const allStreamKeys = await this.getAllStreamKeys();
        const concatValues = allStreamKeys.concat(this.currentStreams);
        const distinctValues = unique(concatValues);

        var added: string[] = [];
        var removed: string[] = [];
        for (const distinctValue of distinctValues) {
            const indexInCurrentStreams = this.currentStreams.indexOf(distinctValue);
            const indexInAllStreamKeys = allStreamKeys.indexOf(distinctValue);
            if (indexInCurrentStreams >= 0) {
                if (indexInAllStreamKeys < 0) {
                    removed.push(distinctValue);
                }
            } else if (indexInAllStreamKeys >= 0) {
                added.push(distinctValue);
            }
        }

        added.forEach((s: string) => {
            this.streamAddedHandler.call(this, s);
            this.currentStreams.push(s);
        });

        removed.forEach((s: string) => {
            this.streamRemovedHandler.call(this, s);
            const index = this.currentStreams.indexOf(s);
            this.currentStreams.splice(index, 1);
        });
        console.log("scanForStreams() ends");
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

    public async subscribeToStreamKey(streamKey: string, callback: (streamId: string, message: StreamDevLocationUpdate) => void) {
        // To get just the last element added into the stream it is enough to send:
        // XREVRANGE key end start [COUNT count]
        // XREVRANGE somestream + - COUNT 1
        let xrr = await this.client.xRevRange(streamKey, "+", "-", { COUNT: 1 });
        var xrrr = xrr as xRevRangeResponse;
        var lastId = this.processMessages(streamKey, xrrr, callback);

        while (true) {
            try {
                // Start streaming from now "$", otherwise use 0-0 (would be too much for small clients) or lastId
                let response : xReadResponse = await this.client.xRead(
                    //commandOptions( { isolated: true }),
                    [{ key: streamKey, id: lastId }], //[{ key: key, id: lastId }],
                    { COUNT: 1, BLOCK: 100 } //{ COUNT: 6, BLOCK: 500 }
                ).catch((err: any) => console.log(`subscribeToStreamKey failed for ${streamKey} -> ${err}`));

                if (response) {
                    // Response is an array of streams, each containing an array of entries:
                    // [{"name": "mystream", "messages": [{"id": "1642088708425-0", "message": {"num":"999"}}]}]
                    for (const entry of response) {
                        lastId = this.processMessages(streamKey, entry.messages, callback);
                    }
                } else {
                    // Response is null, we have read everything that is in the stream right now...
                }
            } catch (err) {
                console.error(err);
            }
        }
    }

    private processMessages(streamKey: string, messages: xReadMessage[], callback: (streamId: string, message: StreamDevLocationUpdate) => void) {
        const lastMessage = messages[messages.length-1];
        const str = JSON.stringify(lastMessage);
        console.log(`Calling callback streamKey:${streamKey}, id: ${lastMessage.id}, message:${str}`);

        const payload = this.getPayload(streamKey, lastMessage.message);
        this.cacheLastValues.set(streamKey, payload);
        callback(streamKey, payload);
        return lastMessage.id;
    }

    private getPayload(streamKey: string, message: StreamDev) : StreamDevLocationUpdate {
        const deviceId = streamKey.split(':')[1];
        // Stream STREAMDEV:test-001:lafleet/devices/location/+/streaming received message
        //{ "dts":"1660234507577","sts":"1660234507777","wts":"1660234507977","rts":"1660234508078",
        //  "seq":"25","lng":"-70.07602263185998","lat":"48.994533368139976","alt":"15.825645368139975",
        //  "h3r15":"8f0e4b64016b653", "state": "ACTIVE" }
        const payload: StreamDevLocationUpdate = {
            deviceId: deviceId, dts: message.dts, seq: message.seq,
            lng: message.lng, lat: message.lat, alt: message.alt,
            h3r15: message.h3r15, state: message.state
        };
        return payload;
    }

    // New streams will be handled if created after the subscription
    public async subscribeToAllStreams(callback: (streamId: string, message: StreamDevLocationUpdate) => void) {
        for (const streamKey of this.currentStreams) {
            this.subscribeToStreamKey(streamKey, callback);
        }
    }

    public getAllCachedValues() : Map<string, StreamDevLocationUpdate> {
        return new Map(this.cacheLastValues);
    }

    public async aggregateDevices(h3resolution: number, h3indices : string[]) {
      //FT.AGGREGATE topic-h3-idx "@topic:topic_1 @h3r0:{802bfffffffffff | 802bffffffffffw }" GROUPBY 1 @h3r0 REDUCE COUNT 0 AS count
      var h3res = "@h3r" + h3resolution;
      var h3filter = h3res + ":{ " + h3indices.join(" | ") + " }";
      var filter = "@topic:" + topic + " " + h3filter;
      const indexName = 'topic-h3-idx';
      var query = ['FT.AGGREGATE', indexName, filter, 'GROUPBY', 1, h3res, "REDUCE", "COUNT", 0, "AS", "count"];
      console.log("Query => " + query.join(" "));
      
      var agg = await this.client.ft.aggregate(indexName, filter, {
        STEPS: [{
                type: AggregateSteps.GROUPBY,
                properties: h3res,
                REDUCE: [{
                    type: AggregateGroupByReducers.COUNT,
                    property: h3res,
                    AS: 'count'
                }]
            }]
      }).catch((err: any) => console.log(`aggregateDevices failed for ${filter} -> ${err}`));
      // Existing device aggregate: {"h3resolution":"0","h3indices":{"total":1,"results":[{"h3r0":"802bfffffffffff","count":"3"}]}}
      console.log(agg);

      var results : IResults = {};
      if (agg !== undefined && agg.total !== undefined && agg.total > 0 && agg.results !== undefined) {
        var h3key = "h3r" + h3resolution;
        for (var i in agg.results) {
            var entry = agg.results[i];
            var h3index = entry[h3key];
            var val = entry.count;
            results[h3index] = parseInt(val);
         }
      }

      // Returns {"h3resolution":"0","h3indices":{"802bfffffffffff":3}}
      return results;
    }

    public async searchDevices (longitude: number, latitude: number, distance: number, distanceUnit: string) {
        //FT.SEARCH topic-lnglat-idx "@topic:topic_1 @lnglat:[-73 45 100 km]" NOCONTENT
        //var list = await redisClient.call('FT.SEARCH', 'topic-lnglat-idx', filter, 'NOCONTENT', 'LIMIT', REDIS_LIMIT_OFFSET, REDIS_LIMIT_COUNT,
        var lnglatFilter = `@lnglat:[ ${longitude} ${latitude} ${distance} ${distanceUnit} ]`;
        var filter = "@topic:" + topic + " " + lnglatFilter;
        const indexName = 'topic-lnglat-idx';
        const limit = { from: REDIS_LIMIT_OFFSET, size: REDIS_LIMIT_COUNT };
        var query = ['FT.SEARCH', indexName, filter, 'NOCONTENT', "LIMIT", "REDIS_LIMIT_OFFSET", "REDIS_LIMIT_COUNT"];
        console.log("Query => " + query.join(" "));
        
        // TODO: Uncomment NOCONTENT when implemented https://github.com/redis/node-redis/blob/master/packages/search/lib/commands/SEARCH.ts#L10
        var sr = await this.client.ft.search(indexName, filter, { LIMIT: limit/*, NOCONTENT*/ })
            .catch((err: any) => console.log(`searchDevices failed for ${filter} -> ${err}`));
        console.log(sr);
        // 1) (integer) 23
        // 2) "DEVLOC:test-10247715:topic_1"
        
        var list : string[] = [];
        if (sr !== undefined && sr.total > 0 && sr.documents !== undefined) {
            for (var i in sr.documents) {
                var entry = sr.documents[i];
                list.push(entry.id);
            }
        }

        return list;
    }

    public async getShape(shapeId: string) : Promise<Shape | undefined> {
        if (shapeId.startsWith(redisClient.shapeLocKeyPrefix))
            throw "shapeId should not start with " + redisClient.shapeLocKeyPrefix;
        
        const retArr = ['$.shapeId', 'AS', 'shapeId', '$.name', 'AS', 'name', '$.status', 'AS', 'status',
            '$.filter', 'AS', 'filter', '$.shape', 'AS', 'shape'];
        var key = redisClient.shapeLocKeyPrefix + shapeId;
        console.log(`Getting shape ${key} from redis`);
        var response = await this.client.json.get(key, '$', { RETURN: retArr })
            .catch((err: any) => console.log(`getShape failed for ${key} -> ${err}`));
        console.log(`Getting shape ${key} from redis succeeded`);
        return response as Shape;
    }

    public async listShapes (shapeType: ShapeType | undefined, status: string | undefined) : Promise<BaseShapeArray> {
        //FT.SEARCH shape-loc-match-idx '@type:(PARKING) @status:ACTIVE' RETURN 9 $.shapeId AS shapeId $.name AS name $.status AS status
        const indexName = 'shape-loc-match-idx';
        var filter = "";
        if (shapeType === undefined && status === undefined)
            throw "At least one filter is required between shapeType and status";
        if (shapeType !== undefined)
            filter += `@type:${shapeType.toString()} `;
        if (status !== undefined)
            filter += `@status:${status}`;
        const limit = { from: REDIS_LIMIT_OFFSET, size: REDIS_LIMIT_COUNT };
        const retArr = ['$.shapeId', 'AS', 'shapeId', '$.name', 'AS', 'name', '$.status', 'AS', 'status', '$.type', 'AS', 'type'];

        console.log(`listShapes query is ${filter}`);
        var response = await this.client.ft.search(indexName, filter, { LIMIT: limit, RETURN: retArr })
            .catch((err: any) => console.log(`listShapes failed for ${filter} -> ${err}`));
        
        if (response !== undefined && response.total !== undefined && response.documents !== undefined) {
            console.log(`Getting list of ${shapeType} from redis succeeded. Total of ${response.total} shapes found.`);
            return response.documents as BaseShapeArray;
        }
        return new Promise<BaseShapeArray>(() => {});
    }

    public async searchShapes(shapeType: ShapeType | undefined, status: string | undefined, h3indices: string[]) : Promise<BaseShapeArray> {
        let [withFilter, withMatch] = await Promise.all([
            this.searchShapesWithFilter(shapeType, status, h3indices),
            this.searchShapesWithMatch(shapeType, status, h3indices)]);

        var arr: BaseShapeArray = [];
        var ids : string[] = [];
        console.log(withFilter);
        for (const item of withFilter) {
            arr.push(item);
            ids.push(item.id);
        }
        console.log(withMatch);
        for (const item of withMatch) { 
            if (ids.includes(item.id))
                continue;
            arr.push(item);
        }
        return arr;
    }

    // One or more index covering the map can be used to search for shapes within them
    public async searchShapesWithFilter (shapeType: ShapeType | undefined, status: string | undefined, h3indices: string[]) : Promise<BaseShapeArray> {
        // FT.SEARCH shape-loc-filter-idx "@status:ACTIVE @f_h3r0:{802bfffffffffff|UNDEFINED} @f_h3r1:{812bbffffffffff|UNDEFINED}
        //   @f_h3r2:{822baffffffffff|UNDEFINED} @f_h3r3:{832baafffffffff|UNDEFINED} @f_h3r4:{842baa5ffffffff|UNDEFINED}
        //   @f_h3r5:{852baa47fffffff|UNDEFINED} @f_h3r6:{862baa477ffffff|UNDEFINED} @f_h3r7:{872baa472ffffff|UNDEFINED}
        //   @f_h3r8:{882baa4721fffff|UNDEFINED} @f_h3r9:{892baa47203ffff|UNDEFINED} @f_h3r10:{8a2baa472007fff|UNDEFINED} 
        //   @f_h3r11:{8b2baa472000fff|UNDEFINED} @f_h3r12:{8c2baa4720001ff|UNDEFINED} @f_h3r13:{8d2baa47200003f|UNDEFINED}
        //   @f_h3r14:{8e2baa472000007|UNDEFINED} @f_h3r15:{8f2baa472000000|UNDEFINED}"
        //   RETURN 9 $.shapeId AS shapeId $.name AS name $.shape AS shape
        return await this.searchShapesImpl(shapeType, status, h3indices, 'shape-loc-filter-idx', "@f_h3r", "searchShapesWithFilter");
    }

    // One or more index used to check if the position is within shapes
    public async searchShapesWithMatch (shapeType: ShapeType | undefined, status: string | undefined, h3indices: string[]) : Promise<BaseShapeArray> {
        // FT.SEARCH shape-loc-match-idx "@status:ACTIVE @s_h3r0:{802bfffffffffff|UNDEFINED} @s_h3r1:{812bbffffffffff|UNDEFINED}
        //   @s_h3r2:{822baffffffffff|UNDEFINED} @s_h3r3:{832baafffffffff|UNDEFINED} @s_h3r4:{842baa5ffffffff|UNDEFINED}
        //   @s_h3r5:{852baa47fffffff|UNDEFINED} @s_h3r6:{862baa45fffffff|UNDEFINED} @s_h3r7:{872baa471ffffff|UNDEFINED}
        //   @s_h3r8:{882baa4721fffff|UNDEFINED} @s_h3r9:{892baa47203ffff|UNDEFINED} @s_h3r10:{8a2baa472007fff|UNDEFINED}
        //   @s_h3r11:{8b2baa472000fff|UNDEFINED} @s_h3r12:{8c2baa4720001ff|UNDEFINED} @s_h3r13:{8d2baa47200003f|UNDEFINED}
        //   @s_h3r14:{8e2baa472000007|UNDEFINED} @s_h3r15:{8f2baa472000000|UNDEFINED}"
        //   RETURN 9 $.shapeId AS shapeId $.name AS name $.shape AS shape
        return await this.searchShapesImpl(shapeType, status, h3indices, 'shape-loc-match-idx', "@s_h3r", "searchShapesWithMatch");
    }

    private async searchShapesImpl(shapeType: ShapeType | undefined, status: string | undefined, h3indices: string[],
        indexName: string, filterPrefix: string, functionName : string) : Promise<BaseShapeArray> {

        var filter = "";
        if (shapeType !== undefined)
            filter += `@type:${shapeType.toString()} `;
        if (status !== undefined)
            filter += `@status:${status} `;

        var dic: {[key: number] : string[] } = {};
        for (const h3index of h3indices) {
            var res = h3.h3GetResolution(h3index);
            var arr = dic[res];
            if (arr === undefined) {
                dic[res] = [h3index];
            } else {
                dic[res].push(h3index);
            }
        }

        for (const key in dic){
            var arr = dic[key];
            var val = arr.join("|");
            filter += `${filterPrefix}${key}:{${val}} `;
        }

        const limit = { from: REDIS_LIMIT_OFFSET, size: REDIS_LIMIT_COUNT };
        const retArr = ['$.shapeId', 'AS', 'shapeId', '$.name', 'AS', 'name', '$.shape', 'AS', 'shape', '$.type', 'AS', 'type'];
        console.log(`${functionName} query is ${filter}`);
        var response = await this.client.ft.search(indexName, filter, { LIMIT: limit, RETURN: retArr })
            .catch((err: any) => console.log(`searchShapesImpl failed for ${filter} -> ${err}`));

        if (response !== undefined && response.total !== undefined && response.documents !== undefined) {
            console.log(`${functionName} redis query succeeded. Total of ${response.total} shapes found.`);
            var bsa = response.documents as BaseShapeArray;
            for (var i=0; i < bsa.length; i++) {
                bsa[i].id = bsa[i].id.replace(redisClient.shapeLocKeyPrefix, "");
                bsa[i].value.shapeId = bsa[i].value.shapeId.replace(redisClient.shapeLocKeyPrefix, "");
            }
            return bsa;
        }
        return new Promise<BaseShapeArray>(() => {});
    }

    private async getShapeAsPolygon(shapeId: string) : Promise<Shape | undefined> {
        if (shapeId.startsWith(redisClient.shapeLocKeyPrefix))
            throw "shapeId does not start with " + redisClient.shapeLocKeyPrefix;
        
        const retArr = ['$.shapeId', 'AS', 'shapeId', '$.name', 'AS', 'name', '$.status', 'AS', 'status', '$.polygon', 'AS', 'polygon'];
        var key = redisClient.shapeLocKeyPrefix + shapeId;
        console.log(`Getting polygon shape of ${key} from redis`);
        var response = await this.client.json.get(key, '$', { RETURN: retArr })
            .catch((err: any) => console.log(`getShape failed for ${key} -> ${err}`));
        console.log(`Getting polygon shape of ${key} from redis succeeded`);
        return response as Shape;
    }

    public async getShapesAsPolygon(shapeIds: string[]) : Promise<PolygonShapeArray> {
        var arr : PolygonShapeArray = [];
        var defaultPolygon: number[][] = [];
        for (var i=0; i < shapeIds.length; i++) {
            var shapeId = shapeIds[i];
            var s = await this.getShapeAsPolygon(shapeId);
            var ps : PolygonShape = {
                shapeId: shapeId,
                name: s?.name || "",
                status: s?.status ?? "",
                type: s?.type ?? "",
                polygon: s?.polygon ?? defaultPolygon
            }
            var kvp : PolygonShapeKvp = {id: shapeId, value: ps};
            arr.push(kvp);

        }
        return arr;
    }

    public async getShapesAsH3Polygon (shapeIds: string[]) : Promise<H3PolygonShapeArray> {

        var shapesArr : Shape[]  = [];
        for (var i=0; i < shapeIds.length; i++) {
            var shapeId = shapeIds[i];
            console.log("getShape: " + shapeId);
            var shape = await this.getShape(shapeId);
            if (shape === undefined)
                continue;
            shapesArr.push(shape);
        }

        var shapes : H3PolygonShapeArray = [];
        for (var a=0; a < shapesArr.length; a++) {
            var s = shapesArr[a];
            if (s == undefined)
                continue;

            var unionPolygons : number[][][] = [];
            for (var b=0; b <= 15; b++) { // For all h3 resolutions
                var h3indexList : string[] = [];
                switch (b) {
                    case 0: h3indexList = s.shape.h3r0; break;
                    case 1: h3indexList = s.shape.h3r1; break;
                    case 2: h3indexList = s.shape.h3r2; break;
                    case 3: h3indexList = s.shape.h3r3; break;
                    case 4: h3indexList = s.shape.h3r4; break;
                    case 5: h3indexList = s.shape.h3r5; break;
                    case 6: h3indexList = s.shape.h3r6; break;
                    case 7: h3indexList = s.shape.h3r7; break;
                    case 8: h3indexList = s.shape.h3r8; break;
                    case 9: h3indexList = s.shape.h3r9; break;
                    case 10: h3indexList = s.shape.h3r10; break;
                    case 11: h3indexList = s.shape.h3r11; break;
                    case 12: h3indexList = s.shape.h3r12; break;
                    case 13: h3indexList = s.shape.h3r13; break;
                    case 14: h3indexList = s.shape.h3r14; break;
                    case 15: h3indexList = s.shape.h3r15; break;
                }
                
                if (h3indexList === undefined || h3indexList.length == 0)
                    continue;
                if (h3indexList.length == 1 && h3indexList[0] == "UNDEFINED")
                    continue;
        
                const isGeoJson = false; // TODO: Future optimization -> Use geoJson
                var mergedPolygons = h3.h3SetToMultiPolygon(h3indexList, isGeoJson); // returns [][][][]
          
                for (var c=0; c < mergedPolygons.length; c++) {
                    var mp = mergedPolygons[c];
                    // TODO: Future optimization -> Won't be needed with geoJson
                    for (var d=0; d < mp.length; d++) {
                        var mpl = mp[d];
                        if (!isGeoJson) {
                            // Need to close the polygon
                            var latB = mpl[0][0];
                            var lonB = mpl[0][1];
                            var latE = mpl[mpl.length-1][0];
                            var lonE = mpl[mpl.length-1][1];
                            if (latB != latE || lonB != lonE) {
                                mpl.push([latB,lonB]);
                            }
                        }
                    }
          
                    unionPolygons.push(mp);
                }
            }

            var singlePolygon : Feature<Polygon | MultiPolygon> | null = null;
            if (unionPolygons.length > 1) {
                var turfPolygons : Feature<Polygon>[] = [];
                for (var h=0; h < unionPolygons.length; h++) {
                    var tp = polygon(unionPolygons[h] as any, { name: 'poly' + h });
                    turfPolygons.push(tp);
                }
            
                var sp : any = turfPolygons[0];
                turfPolygons.shift();
                while (turfPolygons.length > 0) {
                    for (var e=0; e < turfPolygons.length; e++) {
                        var p2 = turfPolygons[e];
                        var isct = intersect(sp, p2);
                        if (isct !== null) {
                            var u = union(sp, p2);
                            if (u === undefined || u === null || u.geometry === undefined || u.geometry === null)
                                continue;
                            
                            sp = u.geometry;
                            turfPolygons.splice(e, 1);
                            break;
                        }
                    }
                }
                singlePolygon = polygon(sp.coordinates, { name: 'singlePolygon' });
            } else {
                singlePolygon = polygon(unionPolygons[0] as any); // as Position[][]
            }
        
            if (singlePolygon !== undefined && singlePolygon !== null) {
                var coordinates : Position[][] | Position[][][] | undefined = singlePolygon.geometry.coordinates;
            
                if (coordinates !== undefined && coordinates !== null) {
                    if (singlePolygon.geometry.type == "Polygon") {
                        var ee : number[][] = []; 
                        for (var c=0; c < coordinates.length; c++) {
                            // @ts-expect-error
                            singlePolygon[c] = [];
                            // TODO: Future optimization -> Won't be needed with geoJson
                            for (var f=0; f < coordinates[c].length; f++) {
                                var lng1 = coordinates[c][f][0].valueOf() as number;
                                var lat1 = coordinates[c][f][1].valueOf() as number;
                                // @ts-expect-error
                                singlePolygon[c][f] = [lat1, lng1];
                            }
                        }
                        // @ts-expect-error
                        var hr : H3PolygonShape = {shapeId: s.shapeId, name: s.name, type: s.type, status: s.status, h3polygon: singlePolygon[0] as any};
                        var kvp : H3PolygonShapeKvp = { id: hr.shapeId, value: hr};
                        console.log(`Shape ${s.shapeId} was added`);
                        shapes.push(kvp);
                    } else { // MultiPolygon
                        for (var d=0; d < coordinates.length; d++) {
                            for (var c=0; c < coordinates[d].length; c++) {
                                var ee : number[][] = [];
                                // TODO: Future optimization -> Won't be needed with geoJson
                                for (var f=0; f < coordinates[d][c].length; f++) {
                                    // @ts-expect-error
                                    var lng1 = coordinates[d][c][f][0].valueOf() as number;
                                    // @ts-expect-error
                                    var lat1 = coordinates[d][c][f][1].valueOf() as number;
                                    ee.push([lat1, lng1]);
                                }
                                var hr : H3PolygonShape = {shapeId: s.shapeId, name: s.name, type: s.type, status: s.status, h3polygon: ee};
                                var kvp : H3PolygonShapeKvp = { id: hr.shapeId, value: hr};
                                console.log(`Shape ${s.shapeId} was added`);
                                shapes.push(kvp);
                            }
                        }
                    }
                }
            }
        }

        return shapes;
    }

    public shutdown () {
        clearInterval(this.timerScanForStreams);
    }
}
