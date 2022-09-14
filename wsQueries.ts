import { WebSocketServer } from 'ws';
import { redisClient } from "./redisClient";
import { v4 as uuidv4 } from 'uuid';

export class wsQueries {

  private readonly wss : WebSocketServer;
  private readonly heartbeatInterval : NodeJS.Timeout;
  private readonly pingInterval = 30000;
  private readonly rec: redisClient;

  readonly CLOSED: number = 3;
  readonly CLOSING: number = 2;
  readonly CONNECTING: number = 0;
  readonly OPEN: number = 1;

  private clients = new Map();
  private subscriptions = new Map();
  private subscriptionsToAll = new Map();
  private readonly validMessageTypes = ['subscriptionRequest', 'subscriptionToAllRequest'];

  constructor (wss: WebSocketServer, rc: redisClient) {
    this.wss = wss;
    this.rec = rc;

    this.heartbeatInterval = setInterval(() => {this.ping();}, this.pingInterval);
  }

  private heartbeat(ws: any) {
    const metadata = this.clients.get(ws);
    metadata.isAlive = true;
    console.log(`Pong ${metadata.id}`);
  }

  private async ping() {
    for (const ws of this.wss.clients) {
      const metadata = this.clients.get(ws);
      if (metadata.isAlive === false) {
        console.log(`Terminating connection because client ${metadata.id} is not alive`);
        ws.terminate();
      }
  
      console.log(`Ping ${metadata.id}`);
      metadata.isAlive = false;
      ws.ping();
    }
  }

  public onConnection(ws: any) {

    const id = uuidv4();
    var isAlive = true;
    var subscribedStreams: string[] = [];
    const metadata = { 'id': id, 'isAlive': isAlive, 'streams': subscribedStreams };
    this.clients.set(ws, metadata);
  
    ws.send('Hi from server');
  
    ws.on('open', () => {
      console.log(`New connection has been made with client ${id}`);
    });
  
    ws.on('pong', () => this.heartbeat(ws));
  
    ws.on('message', (messageAsString: string) => {
      try {
        console.log(`Client ${id} received message => ${messageAsString}`);
  
        // Subscribe to STREAMDEV last update $
        const message = JSON.parse(messageAsString);
        if (message.type === undefined || message.type === null || !this.validMessageTypes.includes(message.type)) {
          console.warn(`Client ${id} sent an unknown message type, ignoring`);
          var payload = {'type': 'subscriptionRequest', 'streams': [], 'status': 404};
          var str = JSON.stringify(payload);
          ws.send(str);
          return;
        }
  
        // NOTE: https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        switch(message.type) {
          case 'subscriptionRequest':
            if (message.streams !== undefined) {
              for (const stream of message.streams) {
                var subscribers : string[] = this.subscriptions.get(stream);
                if (subscribers === undefined) {
                  var newSubscribers : string[] = [];
                  newSubscribers.push(id);
                  this.subscriptions.set(stream, newSubscribers);

                  this.rec.subscribeToStreamKey(stream, (s: string, m: string) => this.processMessage(s, m));
                } else if (!subscribers.includes(id)) {
                  subscribers.push(id);
                }
              }
            }
            break;
          case 'subscriptionToAllRequest':
            var subscribers : string[] = this.subscriptionsToAll.get('*');
            if (subscribers === undefined) {
              var newSubscribers : string[] = [];
              newSubscribers.push(id);
              this.subscriptionsToAll.set('*', newSubscribers);
              this.rec.subscribeToAllStreams((s: string, m: string) => this.processMessage(s, m));
            } else if (!subscribers.includes(id)) {
              subscribers.push(id);
            }
            break;
        }
  
      } catch (err) {
        console.error(`Client ${id} Failed to process message. Error ${err}`);
      }
    });
  
    ws.on('close', () => {
      console.log(`Client ${id} closed the connection`);
      metadata.isAlive = false;
  
      if (this.subscriptions.keys.length > 0) {
        for (const [_stream, subs] of this.subscriptions) {
          if (subs !== undefined) {
            const index = subs.indexOf(metadata.id);
            if (index > -1) {
              subs.splice(index, 1);
            }
          }
        }
      }
        
      if (this.subscriptionsToAll.keys.length > 0) {
        for (const [_stream, subs] of this.subscriptionsToAll) {
          if (subs !== undefined) {
            const index = subs.indexOf(metadata.id);
            if (index > -1) {
              subs.splice(index, 1);
            }
          }
        }
      }
  
      // TODO: Future optimization -> Remove server subscription to the stream(s) if no more client is listening 
  
    });
  }

  public tearDown() {
    clearInterval(this.heartbeatInterval);
  }

  public processMessage(stream: string, message: string) {
    console.log(`Stream ${stream} received message ${message}`);
  
    // TODO: When an update is received, check if matches a shape location to send a special event to the client

    // Send update to subscribed clients
    const deviceId = stream.split(':')[1];
    var msgJson = JSON.parse(message);
    delete msgJson['sts'];
    delete msgJson['wts'];
    delete msgJson['rts'];
    const dts = parseInt(msgJson.dts);
    const seq = parseInt(msgJson.seq);
    const lng = parseFloat(msgJson.lng);
    const lat = parseFloat(msgJson.lat);
    const alt = parseFloat(msgJson.alt);
  
    // Stream STREAMDEV:test-001:lafleet/devices/location/+/streaming received message
    //{ "dts":"1660234507577","sts":"1660234507777","wts":"1660234507977","rts":"1660234508078",
    //  "seq":"25","lng":"-70.07602263185998","lat":"48.994533368139976","alt":"15.825645368139975",
    //  "h3r15":"8f0e4b64016b653"}
    var payload = {'deviceId': deviceId, 'dts': dts, 'seq': seq,
      'lng': lng, 'lat': lat, 'alt': alt, 'h3r15': msgJson.h3r15};
    var payloadAsString = JSON.stringify(payload);
    
    var subscribersNotified : string[] = [];

    var allSubscribers : string[] = this.subscriptionsToAll.get('*');
    if (allSubscribers !== undefined && allSubscribers.length > 0) {
      for (const subscriber of allSubscribers) {
        for (let [ws, metadata] of this.clients) {
          if (subscriber == metadata.id) {
            subscribersNotified.push(metadata.id);
            ws.send(payloadAsString);
          }
        }
      }
    }
  
    var subscribers : string[] = this.subscriptions.get(stream);
    if (subscribers !== undefined && subscribers.length > 0) {
      for (const subscriber of subscribers) {
        for (let [ws, metadata] of this.clients) {
          if (subscriber == metadata.id) {
            if (!subscribersNotified.includes(metadata.id)) {
              subscribersNotified.push(metadata.id);
              ws.send(payloadAsString);
            }
          }
        }
      }
    }
  }
}
