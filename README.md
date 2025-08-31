# Skew Protection Demo with ECS

This repository contains a demonstration of handrolling skew protection using Amazon ECS for the backend service.

Skew protection eliminate version mismatch issues between client and servers in web applications. When you apply skew protection, you can ensure that your clients always interact with the correct version of server-side assets, regardless of when a deployment occurs.

Imagine a scenario where a user is interacting with a web application, and during their session, a new version of the backend service is deployed. Without skew protection, the user might continue to interact with the old version of the backend, leading to potential errors.

With skew protection, this becomes a non-issue.

## Tech Stack

1. **Frontend**: Vite + React
2. **Backend**: Node.js

## Deployment resources

1. **Frontend**: S3 website hosting
2. **Backend**: ECS Fargate + ALB (Application Load Balancer)

## Architecture

The infrastructure is split into two separate CDK stacks for better separation of concerns:

### Backend Stack (`InfraStack-Backend`)

- **Default VPC** for simplified networking
- **ECR Repository** for container images
- **ECS Fargate Cluster** with auto-scaling
- **Application Load Balancer** for high availability
- **CloudWatch Logs** for monitoring

### Frontend Stack (`InfraStack-Frontend`)

- **S3 Bucket** for static website hosting
- **CloudFront Distribution** for global CDN
- **Origin Access Control** for secure S3 access
- **API Proxy** routing `/api/*` to backend ALB

## Deployment

### Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 22+ and pnpm installed
- Docker installed for building container images

### Quick Start

1. **Deploy Infrastructure**:

   ```bash
   pnpm run deploy
   ```

   This will:

   - Deploy the backend stack (VPC, ECS, ALB, ECR)
   - Deploy the frontend stack (S3, CloudFront)
   - Build and push the API container
   - Build and deploy the React app

2. **Individual Deployments**:

   ```bash
   # Deploy only backend infrastructure
   pnpm run deploy:backend

   # Deploy only frontend infrastructure
   pnpm run deploy:frontend

   # Deploy only API code (requires backend stack)
   pnpm run deploy:api

   # Deploy only frontend code (requires frontend stack)
   pnpm run deploy:web
   ```

3. **Monitoring & Management**:

   ```bash
   # View infrastructure changes before deployment
   pnpm run infra:diff

   # Generate CloudFormation templates
   pnpm run infra:synth

   # Destroy all infrastructure
   pnpm run destroy
   ```

### Skew Protection Implementation

The skew protection works by ensuring that:

1. **Version Consistency**: Each deployment creates a new container image with a unique tag
2. **Rolling Updates**: ECS performs rolling updates with health checks to ensure zero downtime
3. **Load Balancer Integration**: ALB only routes traffic to healthy instances
4. **CloudFront Caching**: API responses are not cached, ensuring users always get the latest data
5. **Connection Draining**: Old containers are gracefully shut down only after serving existing requests

## Development

### Local Development

```bash
# Start the API locally
pnpm api dev

# Start the frontend locally
pnpm web dev
```

### Building for Production

```bash
# Build API container
cd apps/api && docker build -t skew-protection-api .

# Build frontend
cd apps/web && pnpm build
```
