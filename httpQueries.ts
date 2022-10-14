import { IncomingMessage, ServerResponse } from 'http';
import { redisClient } from "./redisClient";
import { BaseShape, PolygonShape, H3PolygonShape, ShapeType } from './shapeTypes';


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

interface locationSearchShapeListPost {
  shapeType: string | undefined;
  status: string | undefined;
  h3indices: string[];
}

interface polygonFetchShapeListPost {
  shapeIds: string[];
}

export class httpQueries {

  private readonly rec: redisClient;

  constructor(rc: redisClient) {
    this.rec = rc;
  }

  public async onRequest (request: IncomingMessage, response: ServerResponse) {
    console.log(`Request received to endpoint ${request.url} with method ${request.method}`);

    // TODO: Catch errors when json is malformed to avoid service crash
    var isLocal = process.env.REDIS_HOST == "localhost";
    if (isLocal && request.method === 'OPTIONS') {
      var allowMethods = "";
      switch (request.url) {
        case "/h3/aggregate/devices/count":
        case "/radius/search/devices/list":
        case "/h3/search/shapes/list":
        case "/h3/fetch/shapes/polygon":
        case "/h3/fetch/shapes/h3polygon":
          allowMethods = "POST";
          break;
        case "/health":
        case "/":
          allowMethods = "GET";
          break;
        default:
          allowMethods = "POST, GET";
          break;
      }

      response.setHeader('Access-Control-Allow-Origin','*');
      response.setHeader('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
      response.setHeader('Access-Control-Allow-Methods', allowMethods);
      response.statusCode = 200;
      response.end("OK");
    } else {
      switch (request.url) {
        case '/h3/aggregate/devices/count': {
          response.setHeader('Content-Type', 'application/json');
          if (request.method === 'GET') {
            response.end("HTTP method not supported. Use POST instead.");
          } else if (request.method === 'POST') {
            const posts : h3AggregateDeviceCountPost[] = [];
            this.getJSONDataFromRequestStream<h3AggregateDeviceCountPost>(request)
              .then(async post => {
                posts.push(post);
                var data = await this.aggregateDevices(post.h3resolution, post.h3indices);
                var str = JSON.stringify(data);
                if (isLocal)
                  response.setHeader('Access-Control-Allow-Origin','*');
                response.statusCode = 200;
                response.end(str);
              });
          }
          break;
        }
        case '/radius/search/devices/list': {
          response.setHeader('Content-Type', 'application/json');
          if (request.method === 'GET') {
            response.end("HTTP method not supported. Use POST instead.");
          } else if (request.method === 'POST') {
            const posts : locationSearchDeviceListPost[] = [];
            this.getJSONDataFromRequestStream<locationSearchDeviceListPost>(request)
              .then(async post => {
                posts.push(post);
                var data = await this.searchDevices (post.longitude, post.latitude, post.distance, post.distanceUnit);
                var str = JSON.stringify(data);
                if (isLocal)
                  response.setHeader('Access-Control-Allow-Origin','*');
                response.statusCode = 200;
                response.end(str);
              });
          }
          break;
        }
        case '/h3/search/shapes/list': {
          response.setHeader('Content-Type', 'application/json');
          if (request.method === 'GET') {
            response.end("HTTP method not supported. Use POST instead.");
          } else if (request.method === 'POST') {
            const posts : locationSearchShapeListPost[] = [];
            this.getJSONDataFromRequestStream<locationSearchShapeListPost>(request)
              .then(async post => {
                posts.push(post);
                const shapeType = post.shapeType as ShapeType;
                var data = await this.searchShapes (shapeType, post.status, post.h3indices);
                var str = JSON.stringify(data);
                if (isLocal)
                  response.setHeader('Access-Control-Allow-Origin','*');
                response.statusCode = 200;
                response.end(str);
              });
          }
          break;
        }
        case '/h3/fetch/shapes/polygon': {
          response.setHeader('Content-Type', 'application/json');
          if (request.method === 'GET') {
            response.end("HTTP method not supported. Use POST instead.");
          } else if (request.method === 'POST') {
            const posts : polygonFetchShapeListPost[] = [];
            this.getJSONDataFromRequestStream<polygonFetchShapeListPost>(request)
              .then(async post => {
                posts.push(post);
                var data = await this.getShapesAsPolygon (post.shapeIds);
                var str = JSON.stringify(data);
                if (isLocal)
                  response.setHeader('Access-Control-Allow-Origin','*');
                response.statusCode = 200;
                response.end(str);
              });
          }
          break;
        }
        case '/h3/fetch/shapes/h3polygon': {
          response.setHeader('Content-Type', 'application/json');
          if (request.method === 'GET') {
            response.end("HTTP method not supported. Use POST instead.");
          } else if (request.method === 'POST') {
            const posts : polygonFetchShapeListPost[] = [];
            this.getJSONDataFromRequestStream<polygonFetchShapeListPost>(request)
              .then(async post => {
                posts.push(post);
                var data = await this.getShapesAsH3Polygon (post.shapeIds);
                var str = JSON.stringify(data);
                if (isLocal)
                  response.setHeader('Access-Control-Allow-Origin','*');
                response.statusCode = 200;
                response.end(str);
              });
          }
          break;
        }
        case '/health': {
          response.setHeader('Content-Type', 'text/html');
          if (request.method === 'GET') {
            if (isLocal)
              response.setHeader('Access-Control-Allow-Origin','*');
            response.statusCode = 200;
            response.end("OK");
          }
          break;
        }
        case '/': {
          response.setHeader('Content-Type', 'text/html');
          if (request.method === 'GET') {
            if (isLocal)
              response.setHeader('Access-Control-Allow-Origin','*');
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
    }
  }

  private getJSONDataFromRequestStream<T>(request: IncomingMessage): Promise<T> {
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
        var merged = Buffer.concat(chunks).toString();
        resolve(JSON.parse(merged));
      });
    })
  }
      
  private async aggregateDevices (h3resolution: number, h3indices : string[] ) {
    var results : any = {"h3resolution": h3resolution, "h3indices": {}};
    try {
      console.log("Entering device aggregate...");

      var dic = await this.rec.aggregateDevices(h3resolution, h3indices);
      results["h3indices"] = dic;

      console.log("Existing device aggregate: " + JSON.stringify(results));
    } catch (err) {
      console.error("Error handling redis messages", err);
    }
    return results;
  }
      
  private async searchDevices (longitude: number, latitude : number, distance: number, distanceUnit: string) : Promise<string[]> {
    var results : string[] = [];
    try {
      console.log("Entering device search...");

      var list = await this.rec.searchDevices(longitude, latitude, distance, distanceUnit);
      results = list;

      console.log("Existing device search: " + JSON.stringify(results));
    } catch (err) {
      console.error("Error while searching for devices", err);
    }
    return results;
  }

  public async searchShapes (shapeType: ShapeType | undefined, status: string | undefined, h3indices: string[]) : Promise<BaseShape[]> {
    try {
      console.log("Entering search shapes...");
      var results = await this.rec.searchShapes(shapeType, status, h3indices);
      var baseShapes = results.map(bs => bs.value);
      var ids = results.map(x => x.value.shapeId);
      console.log("Existing search shapes with " + ids.join(", "));
      return baseShapes;
    } catch (err) {
      console.error("Error while searching for shapes", err);
    }
    const emptyArr : BaseShape[] = [];
    return emptyArr;
  }

  public async getShapesAsPolygon (shapeIds: string[]) : Promise<PolygonShape[]> {
    try {
      console.log("Entering get polygon shapes for " + shapeIds.join(","));
      var results = await this.rec.getShapesAsPolygon(shapeIds);
      var polygonShapes = results.map(ps => ps.value);
      var ids = results.map(x => x.value.shapeId);
      console.log("Existing get polygon shapes with " + ids.join(", "));
      return polygonShapes;
    } catch (err) {
      console.error("Error while getting polygon for shapes", err);
    }
    const emptyArr : PolygonShape[] = [];
    return emptyArr;
  }

  public async getShapesAsH3Polygon (shapeIds: string[]) : Promise<H3PolygonShape[]> {
    try {
      console.log("Entering get h3polygon shapes for " + shapeIds.join(","));
      var results = await this.rec.getShapesAsH3Polygon(shapeIds);
      var polygonShapes = results.map(ps => ps.value);
      var ids = results.map(x => x.value.shapeId);
      console.log("Existing get h3polygon shapes with " + ids.join(", "));
      return polygonShapes;
    } catch (err) {
      console.error("Error while getting h3polygon for shapes", err);
    }
    const emptyArr : H3PolygonShape[] = [];
    return emptyArr;
  }

  public async listShapes () : Promise<BaseShape[]> {
    try {
      console.log("Entering list shapes...");
      var results = await this.rec.listShapes(undefined, "ACTIVE");
      var baseShapes = results.map(bs => bs.value);
      console.log("Existing list shapes: " + JSON.stringify(results));
      return baseShapes;
    } catch (err) {
      console.error("Error while listing shapes", err);
    }
    const emptyArr : BaseShape[] = [];
    return emptyArr;
  }
}