import { IncomingMessage, ServerResponse } from 'http';
import { redisClient } from "./redisClient";


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

export class httpQueries {

  private readonly rec: redisClient;

  constructor(rc: redisClient) {
    this.rec = rc;
  }

  public async onRequest (request: IncomingMessage, response: ServerResponse) {
    switch (request.url) {
      case '/h3/aggregate/device-count': {
        response.setHeader('Content-Type', 'application/json');
        if (request.method === 'GET') {
          response.end("HTTP method not supported. Use POST instead.");
        } else if (request.method === 'POST') {
          const posts : h3AggregateDeviceCountPost[] = [];
          this.getJSONDataFromRequestStream<h3AggregateDeviceCountPost>(request)
            .then(async post => {
              posts.push(post);
              var data = await this.aggregate(post.h3resolution, post.h3indices);
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
          this.getJSONDataFromRequestStream<locationSearchDeviceListPost>(request)
            .then(async post => {
              posts.push(post);
              var data = await this.search (post.longitude, post.latitude, post.distance, post.distanceUnit);
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
        resolve(
          JSON.parse(
            Buffer.concat(chunks).toString()
          )
        )
      });
    })
  }
      
  private async aggregate (h3resolution: number, h3indices : string[] ) {
    var results : any = {"h3resolution": h3resolution, "h3indices": {}};
    try {
      console.log("Entering aggregate...");
  
      var agg = await this.rec.aggregate(h3resolution, h3indices);
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
      
  private async search (longitude: number, latitude : number, distance: number, distanceUnit: string) {
    var results : string[] = [];
    try {
      console.log("Entering search...");

      
      var list = await this.rec.search(longitude, latitude, distance, distanceUnit);
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

}