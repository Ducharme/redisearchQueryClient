import WebSocket, { WebSocketServer } from 'ws';
import { redisClient } from "./redisClient";
import { v4 as uuidv4 } from 'uuid';
import { StreamDevLocationUpdate } from './deviceTypes';

interface ConnectionMetadata {
  id: string;
  isAlive: boolean;
  streams: string[]
}

// {'type': 'subscriptionRequest', 'streams': ['STREAMDEV:claude1', 'STREAMDEV:claude2']}
// {'type': 'subscriptionToAllRequest'}
interface SubscriptionRequest {
  type: string;
  streams?: string[];
}

interface SubscriptionResponse extends SubscriptionRequest {
  type: string;
  streams?: string[];
  status: number;
}

export class wsQueries {

  private readonly wss : WebSocketServer;
  private readonly heartbeatInterval : NodeJS.Timeout;
  private readonly pingInterval = 30 * 1000;
  private readonly rec: redisClient;

  readonly CLOSED: number = 3;
  readonly CLOSING: number = 2;
  readonly CONNECTING: number = 0;
  readonly OPEN: number = 1;

  private clients = new Map<WebSocket, ConnectionMetadata>();
  private subscriptions = new Map<string, string[]>(); // streamKey, subscribers(clientMetadataIds)
  private subscriptionsToAll = new Map<string, string[]>(); // "*"", subscribers(clientMetadataIds)
  private readonly validMessageTypes = ['subscriptionRequest', 'subscriptionToAllRequest'];
  private readonly AllStreamKeys = '*';
  
  constructor (wss: WebSocketServer, rc: redisClient) {
    this.wss = wss;
    this.rec = rc;

    this.heartbeatInterval = setInterval(() => {this.ping();}, this.pingInterval);
    this.rec.assignAddedHandler(this.newStreamCreated.bind(this));
    this.rec.assignRemovedHandler(this.oldStreamRemoved.bind(this));
  }

  public newStreamCreated(streamKey: string) {
    this.rec.subscribeToStreamKey(streamKey, this.notifyAllSubscribers.bind(this));
  }

  public oldStreamRemoved(streamKey: string) {
    this.unsubscribeToStreamKey(streamKey);
  }

  private heartbeat(ws: any) {
    const metadata = this.clients.get(ws);
    if (metadata) {
      metadata.isAlive = true;
      console.log(`Pong ${metadata.id}`);
    }
  }

  private async ping() {
    for (const ws of this.wss.clients) {
      const metadata = this.clients.get(ws);
      if (!metadata)
        continue;

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
    const metadata : ConnectionMetadata = { id: id, isAlive: isAlive, streams: subscribedStreams };
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
        const message = JSON.parse(messageAsString) as SubscriptionRequest;
        if (!message.type || !this.validMessageTypes.includes(message.type)) {
          console.warn(`Client ${id} sent an unknown message type, ignoring`);
          var payload : SubscriptionResponse = {type: 'subscriptionRequest', streams: [], status: 404};
          var str = JSON.stringify(payload);
          ws.send(str);
          return;
        }
  
        // NOTE: https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        switch(message.type) {
          case 'subscriptionRequest':
            if (message.streams) {
              for (const streamKey of message.streams) {
                var subscribers : string[] | undefined = this.subscriptions.get(streamKey);
                if (!subscribers) {
                  var newSubscribers : string[] = [];
                  newSubscribers.push(id);
                  this.subscriptions.set(streamKey, newSubscribers);

                  this.rec.subscribeToStreamKey(streamKey, (s: string, m: StreamDevLocationUpdate) => this.notifyAllSubscribers(s, m));
                } else if (!subscribers.includes(id)) {
                  subscribers.push(id);
                }
              }

              const cache = this.rec.getAllCachedValues();
              for (const [streamKey, payload] of cache) {
                if (message.streams.includes(streamKey)) {
                  this.notifyOneSubscriber(id, payload);
                }
              }
            }
            break;
          case 'subscriptionToAllRequest':
            var subscribers : string[] | undefined = this.subscriptionsToAll.get(this.AllStreamKeys);
            if (!subscribers) {
              var newSubscribers : string[] = [];
              newSubscribers.push(id);
              this.subscriptionsToAll.set(this.AllStreamKeys, newSubscribers);
              this.rec.subscribeToAllStreams((s: string, m: StreamDevLocationUpdate) => this.notifyAllSubscribers(s, m));
            } else if (!subscribers.includes(id)) {
              subscribers.push(id);
            }

            const cache = this.rec.getAllCachedValues();
            for (const [_streamKey, payload] of cache) {
              this.notifyOneSubscriber(id, payload);
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
          if (subs) {
            const index = subs.indexOf(metadata.id);
            if (index > -1) {
              subs.splice(index, 1);
            }
          }
        }
      }
        
      if (this.subscriptionsToAll.keys.length > 0) {
        for (const [_stream, subs] of this.subscriptionsToAll) {
          if (subs) {
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

  private unsubscribeToStreamKey(streamKey: string) {
    if (this.subscriptions.keys.length > 0) {
      this.subscriptions.delete(streamKey);
    }

    // TODO: Notify subscribers subscriptions and all
  }

  public tearDown() {
    clearInterval(this.heartbeatInterval);
    this.rec.shutdown();
  }

  // TODO: When an update is received, check if matches a shape location to send a special event to the client
  public notifyAllSubscribers(streamKey: string, message: StreamDevLocationUpdate) {
    var payloadAsString = JSON.stringify(message);
    console.log(`Stream ${streamKey} received message ${payloadAsString}`);

    // Send update to subscribed clients
    var subscribersNotified : string[] = [];

    var allSubscribers : string[] | undefined = this.subscriptionsToAll.get(this.AllStreamKeys);
    if (allSubscribers && allSubscribers.length > 0) {
      for (const subscriber of allSubscribers) {
        for (let [ws, metadata] of this.clients) {
          if (subscriber == metadata.id) {
            subscribersNotified.push(metadata.id);
            ws.send(payloadAsString);
          }
        }
      }
    }
  
    var subscribers : string[] | undefined = this.subscriptions.get(streamKey);
    if (subscribers && subscribers.length > 0) {
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

  public notifyOneSubscriber(subscriberId: string, message: StreamDevLocationUpdate) {
    var payloadAsString = JSON.stringify(message);
    console.log(`Notifying ${subscriberId} with message ${payloadAsString}`);
    for (let [ws, metadata] of this.clients) {
      if (subscriberId == metadata.id) {
        ws.send(payloadAsString);
        break;
      }
    }
  }
}
