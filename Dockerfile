# Production container for Google Cloud Run
FROM node:22-slim

# Install ffmpeg and ffprobe for native media player probe and transcoding
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./

# Install all dependencies needed for build and runtime
RUN npm ci

# Copy project files
COPY . .

# Build the frontend assets
RUN npm run build

# Default environment variables for Cloud Run
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start server using the full-stack entry point
CMD ["npm", "start"]
