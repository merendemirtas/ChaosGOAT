FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

EXPOSE 5173

CMD ["node", "./node_modules/vite/bin/vite.js", "preview", "--configLoader", "native", "--host", "0.0.0.0", "--port", "5173"]
