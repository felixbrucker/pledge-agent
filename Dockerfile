FROM node:18-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY package.json yarn.lock /app/
RUN yarn install
COPY . /app

CMD ["yarn", "start"]
