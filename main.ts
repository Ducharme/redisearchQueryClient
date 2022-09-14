import { createServer, IncomingMessage, ServerResponse } from 'http';
import { httpQueries } from './httpQueries';
import { WebSocketServer } from 'ws';
import { redisClient } from "./redisClient";
import { shapeCache } from './shapeCache';
import { wsQueries } from './wsQueries';

const SERVER_PORT = process.env.SERVER_PORT || 3131;


const server = createServer();
const wss = new WebSocketServer({server});
var rec = new redisClient();
const sc = new shapeCache(rec);
const wsq = new wsQueries(wss, rec);
const hq = new httpQueries(rec);

server.on('request', async (request: IncomingMessage, response: ServerResponse) => {
  hq.onRequest(request, response);
});

wss.on('connection', (ws: any) => { wsq.onConnection(ws); });
wss.on('close', () => { wsq.tearDown(); });
 
server.listen(SERVER_PORT, () => {
  console.log(`Server listening on port ${SERVER_PORT}`);
}).on("error", (error: any) => console.log(error));

const run = async () => {
  await rec.connect();
  await rec.ping();

  // Download all shapes from Redis
  await sc.downloadAllActiveShapes();
}

run();
