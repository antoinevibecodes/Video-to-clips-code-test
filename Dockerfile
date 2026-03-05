FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY web/package.json web/package-lock.json* ./web/
WORKDIR /app/web
RUN npm install

# Copy source
COPY web/ ./

# Create data dirs
RUN mkdir -p /app/data/uploads /app/data/clips

EXPOSE 3000

CMD ["npm", "run", "dev"]
