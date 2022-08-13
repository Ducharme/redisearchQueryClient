FROM node:17-alpine3.15 AS build
RUN mkdir -p /home/node/app
WORKDIR /home/node/app
COPY *.ts package.json tsconfig.json ./
RUN npm install --unsafe-perm
RUN npm run-script build

FROM node:17-alpine3.15 AS deps
RUN mkdir -p /home/node/app
WORKDIR /home/node/app
COPY package.json ./
RUN npm install --only=production --no-optional --ignore-scripts

FROM node:17-alpine3.15
RUN mkdir -p /home/node/app
RUN chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node --from=deps /home/node/app/node_modules ./node_modules/
COPY --chown=node:node --from=build /home/node/app/dist ./dist/
USER node
CMD [ "node", "/home/node/app/dist/main.js" ]
