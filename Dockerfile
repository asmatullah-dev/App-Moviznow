# Production container for Oracle Cloud, Cloud Run, VPS, or Docker
FROM node:22-slim

# Install ffmpeg, ffprobe, and curl for video streaming, transcoding, and health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json* ./

# Install dependencies needed for build and runtime
RUN npm install

# Copy all project files
COPY . .

# Build the frontend assets
RUN npm run build

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Health check to ensure the streaming API is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || curl -f http://localhost:${PORT}/ || exit 1

# Start the full-stack server
CMD ["npm", "start"]
