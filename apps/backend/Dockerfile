# Node.js Backend Dockerfile
FROM node:20-alpine

# Install Python and build tools for native modules
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data photos temp logs

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 4000

# Start application
CMD ["npm", "start"]
