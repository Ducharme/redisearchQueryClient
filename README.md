

# Playing with docker locally

```
docker build --tag redisearch-query-js:v0.01 .
sudo docker run -it -p 3131:3131 redisearch-query-js:v0.01
```

## Playing around

```
curl -X POST -H "Content-Type: application/json" -d '{"h3resolution":"0","h3indices":["802bfffffffffff","8023fffffffffff"]}' http://localhost:3131/h3/aggregate/device-count
curl -s --raw --show-error --verbose -X POST -H "Content-Type: application/json"  -H "Accept: application/json" -d '{"h3resolution":"0","h3indices":["801dfffffffffff","802bfffffffffff","8003fffffffffff"]}' http://localhost:3131/h3/aggregate/device-count
curl -X POST -H "Content-Type: application/json" -d '{"longitude": -73.561668,"latitude":45.508888,"distance": 100.0, "distanceUnit": "km"' http://localhost:3131/location/search/radius/device-list

curl -s --raw --show-error --verbose -L -X POST -H "Content-Type: application/json" -H "Accept: application/json" -d '{"h3resolution":"0","h3indices":["802bfffffffffff","8023fffffffffff"]}' https://<random>.cloudfront.net/query/h3/aggregate/device-count
/h3/aggregate/device-count
curl -s --raw --show-error --verbose -L -X POST -H "Content-Type: application/json" -H "Accept: application/json" -d '{"h3resolution":"0","h3indices":["802bfffffffffff","8023fffffffffff"]}' https://<ELB>/h3/aggregate/device-count
/h3/aggregate/device-count
curl -s --raw --show-error --verbose -L -X GET https://d29ksk98fzh8z0.cloudfront.net/query/health
curl -s --raw --show-error --verbose -L -X GET https://d29ksk98fzh8z0.cloudfront.net/query/
```

```
const posts : Post[] = [ { h3resolution: 0, h3indices: ["802bfffffffffff", "8023fffffffffff"] } ];
```

# Play with redis locally

```
sudo docker run --name redis-service -d -p 6379:6379 redis
redis-cli

sudo docker run -it -p 6379:6379 redis bash
sudo docker exec -it redis-service bash
root@72c388dc2cb8:/data# redis-cli
```
