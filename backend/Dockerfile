# ---------------------------------------------------------
# Production image for order processing Node.js backend
# ---------------------------------------------------------

FROM node:22-alpine

# Application directory
WORKDIR /app

# Install production dependencies only
COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

# Copy application source
COPY src ./src
COPY sql ./sql

# Create upload directories
RUN mkdir -p /app/uploads/assets /app/uploads/branding

# Backend API port
EXPOSE 8075

# Production environment
ENV NODE_ENV=production

# Start Express server
CMD ["node", "src/index.js"]