# Use official Node base image
FROM node:20-bullseye-slim

# install dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libxss1 \
    libasound2 \
    libgbm1 \
    libx11-xcb1 \
    ca-certificates \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package.json
COPY package-lock.json package-lock.json 2>/dev/null || true

RUN npm install --unsafe-perm

# copy source
COPY . .

# ensure Playwright dependencies are installed
RUN npx playwright install --with-deps chromium

EXPOSE 3000
CMD ["node", "index.js"]
