# ---------------------------------------------------------
# Stage 1: Build React application
# ---------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./

RUN npm ci

# Copy application source
COPY . .

# Build production React application
RUN npm run build


# ---------------------------------------------------------
# Stage 2: Serve production build with Nginx
# ---------------------------------------------------------
FROM nginx:alpine

# Remove default Nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy React production build
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Frontend HTTP port
EXPOSE 8074

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]