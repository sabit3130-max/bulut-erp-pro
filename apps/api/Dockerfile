FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "dist/main.js"]
