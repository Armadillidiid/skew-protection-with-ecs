# Skew Protection Demo with ECS

This repository demonstrates how to implement deployment skew protection using Amazon ECS for backend services. Skew protection ensures that clients always interact with compatible versions of your application during deployments, preventing version mismatch errors.

Consider a scenario where a user is actively using your web app when you deploy breaking changes to both the frontend and backend. Without skew protection, the user's browser still has the old frontend code loaded, but their API requests now hit the new backend version, causing the application to break.

With skew protection, the user continues to interact with the old backend version until they refresh their page and receive the new frontend code.

## Tech Stack

1. **Frontend**: Vite + React
2. **Backend**: Node.js

## Deployment resources

1. **Frontend**: S3 website hosting + CloudFront
2. **Backend**: ECS Fargate + ALB (Application Load Balancer) with Blue/Green deployment strategy

### Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 22+ (for native TS support)
- PNPM (for workspaces)
- Docker

### Quick Start

1. **Deploy Infrastructure**:

   ```bash
   pnpm run infra:deploy
   ```

2. **Monitoring & Management**:

   ```bash
   # View infrastructure changes before deployment
   pnpm run infra:diff

   # Generate CloudFormation templates
   pnpm run infra:synth

   # Destroy all infrastructure
   pnpm run infra:destroy
   ```

**3. Start local Development**:

```bash
pnpm run dev
```

4. **Build for production**

```bash
pnpm run build
```
