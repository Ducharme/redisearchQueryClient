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
}).on("error", (error: any) => console.error(error));

const run = async () => {
  // do app specific cleaning before exiting
  process.on('exit', function () {
    console.log('exiting...');
    rec.shutdown();
  });

  // catch ctrl+c event and exit normally
  process.on('SIGINT', function () {
    console.log('Ctrl-C...');
    rec.shutdown();
  });

  //catch uncaught exceptions, trace, then exit normally
  process.on('uncaughtException', function(e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    rec.shutdown();
  });

  await rec.connect();
  await rec.ping();

  // Download all shapes from Redis
  await sc.downloadAllActiveShapes();
}

run();
