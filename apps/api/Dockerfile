# Use the official Node.js runtime as the base image
FROM node:22-alpine

# Set environment variables
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 
# Enable corepack and set the working directory inside the container
RUN corepack enable
WORKDIR /app

# Copy package.json and pnpm-lock.yaml (if available)
COPY package.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy the application code
COPY index.ts ./

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

# Change ownership of the app directory to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to the nodejs user
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Define environment variable
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "index.ts"]
