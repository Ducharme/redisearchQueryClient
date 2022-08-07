const redis = require("ioredis");
import { createServer, IncomingMessage, ServerResponse } from 'http';

const SERVER_PORT = process.env.SERVER_PORT || 3131;
const DefaultTopic = "lafleet/devices/location/+/streaming";
const TOPIC = process.env.TOPIC || DefaultTopic;

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_LIMIT_OFFSET = 0;
const REDIS_LIMIT_COUNT = 250;

const redisParams = { host: REDIS_HOST, port: REDIS_PORT };
const redisClient = redis.createClient(redisParams);
redisClient.on("error", function(error: any) { console.error(error); });

interface h3AggregateDeviceCountPost {
  h3resolution: number;
  h3indices: string[];
}

interface locationSearchDeviceListPost {
  longitude: number;
  latitude: number;
  distance: number;
  distanceUnit: string;
}

const server = createServer();

server.on('request', async (request: IncomingMessage, response: ServerResponse) => {
  switch (request.url) {
    case '/h3/aggregate/device-count': {
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET') {
        response.end("HTTP method not supported. Use POST instead.");
      } else if (request.method === 'POST') {
        const posts : h3AggregateDeviceCountPost[] = [];
        getJSONDataFromRequestStream<h3AggregateDeviceCountPost>(request)
          .then(async post => {
            posts.push(post);
            var data = await aggregate(post.h3resolution, post.h3indices);
            var str = JSON.stringify(data);
            response.statusCode = 200;
            response.end(str);
          });
      }
      break;
    }
    case '/location/search/radius/device-list': {
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET') {
        response.end("HTTP method not supported. Use POST instead.");
      } else if (request.method === 'POST') {
        const posts : locationSearchDeviceListPost[] = [];
        getJSONDataFromRequestStream<locationSearchDeviceListPost>(request)
          .then(async post => {
            posts.push(post);
            var data = await search (post.longitude, post.latitude, post.distance, post.distanceUnit);
            var str = JSON.stringify(data);
            response.statusCode = 200;
            response.end(str);
          });
      }
      break;
    }
    case '/health': {
      response.setHeader('Content-Type', 'text/html');
      if (request.method === 'GET') {
        response.statusCode = 200;
        response.end("OK");
      }
      break;
    }
    case '/': {
      response.setHeader('Content-Type', 'text/html');
      if (request.method === 'GET') {
        response.statusCode = 200;
        response.end("<h1>Welcome to Query Service</h1>");
      }
      break;
    }
    default: {
      response.statusCode = 404;
      response.end("Not Found");
    }
  }
});
 
server.listen(SERVER_PORT, () => {
  console.log(`Server listening on port ${SERVER_PORT}`);
}).on("error", (error: any) => console.log(error));


function getJSONDataFromRequestStream<T>(request: IncomingMessage): Promise<T> {
  return new Promise(resolve => {
    const chunks : any[] = [];
    request.on('data', (chunk: string) => {
      chunks.push(chunk);

      // Too much POST data, kill the connection!
      // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
      if (chunks.length > 1e6) {
        request.destroy();
      }
    });
    request.on('end', () => {
      resolve(
        JSON.parse(
          Buffer.concat(chunks).toString()
        )
      )
    });
  })
}

async function aggregate (h3resolution: number, h3indices : string[] ) {
  var results : any = {"h3resolution": h3resolution, "h3indices": {}};
  try {
    console.log("Entering aggregate...");

    //FT.AGGREGATE topic-h3-idx "@topic:lafleet/devices/location/+/streaming @h3r0:{802bfffffffffff | 802bffffffffffw }" GROUPBY 1 @h3r0 REDUCE COUNT 0 AS num_devices
    var h3res = "@h3r" + h3resolution;
    var h3filter = h3res + ":{ " + h3indices.join(" | ") + " }";
    var filter = "@topic:" + TOPIC + " " + h3filter;
    var query = ['FT.AGGREGATE', 'topic-h3-idx', filter, 'GROUPBY', 1, h3res, "REDUCE", "COUNT", 0, "AS", "num_devices"].join(" ");
    console.log("Query => " + query);
    
    var agg = await redisClient.call('FT.AGGREGATE', 'topic-h3-idx', filter, 'GROUPBY', 1, h3res, "REDUCE", "COUNT", 0, "AS", "num_devices",
      function(err: any, res: any) {
        if (err) {
          console.error(err);
        } else {
          console.log("Success: " + res);
        }
      }
    );
    //[ 'h3r0', '80d5fffffffffff', 'num_devices', '3' ]
    console.log("Aggregate: " + agg);

    for (let i = 0; i < agg.length; i++) {
        var row = agg[i];
        console.log(row);
        
        if (!Array.isArray(row))
            continue;

        if (row.length < 4)
            continue;
            
        var key = row[1];
        var val = row[3];
        results["h3indices"][key] = val == null || val == '' ? 0 : parseInt(val);
    }
    console.log("Resutls: " + JSON.stringify(results));
  } catch (err) {
    console.error("Error handling redis messages", err);
  }
  return results;
}

async function search (longitude: number, latitude : number, distance: number, distanceUnit: string ) {
  var results : string[] = [];
  try {
    console.log("Entering search...");

    //FT.SEARCH topic-lnglat-idx "@topic:lafleet/devices/location/+/streaming @lnglat:[-73 45 100 km]" NOCONTENT
    var lnglatFilter = `@lnglat:[ ${longitude} ${latitude} ${distance} ${distanceUnit} ]`;
    var filter = "@topic:" + TOPIC + " " + lnglatFilter;
    console.log("Filter = " + filter);
    
    var list = await redisClient.call('FT.SEARCH', 'topic-lnglat-idx', filter, 'NOCONTENT', 'LIMIT', REDIS_LIMIT_OFFSET, REDIS_LIMIT_COUNT,
      function(err: any, res: any) {
        if (err) {
          console.error(err);
        } else {
          console.log("Success" + res);
        }
      }
    );
    // 1) (integer) 23
    // 2) "DEVLOC:test-10247715:lafleet/devices/location/+/streaming"
    console.log("List: " + list);

    for (let i = 0; i < list.length; i++) {
        var val = list[i];
        console.log(val);

        if (i === 0)
            continue;

        results.push(val);
    }
    console.log("Existing search: " + JSON.stringify(results));
  } catch (err) {
    console.error("Error handling redis messages", err);
  }
  return results;
}



