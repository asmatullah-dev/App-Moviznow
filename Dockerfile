# Production container for Google Cloud Run
FROM node:22-slim

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
