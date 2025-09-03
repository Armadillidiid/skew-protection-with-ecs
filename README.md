# Skew Protection Demo with ECS

This repository demonstrates how to implement deployment skew protection using Amazon ECS for backend services. Skew protection ensures that clients always interact with compatible versions of your application during deployments, preventing version mismatch errors.

Consider a scenario where a user is actively using your web app when you deploy breaking changes to both the frontend and backend. Without skew protection, the user's browser still has the old frontend code loaded, but their API requests now hit the new backend version, causing the application to break.

With skew protection, the user continues to interact with the old backend version until they refresh their page and receive the new frontend code.

> **UPDATE**: I couldn't find a way to make this work. I thought with B/G deployment, I could create a listener rule to route traffic to the old service before it gets phased out. Problem is ECS manages the weighted listener rule traffic itself and it's hard to tell which is the current production target. That's one problem.
>
> The second is we have to register a lifecycle hook for `PRODUCTION_TRAFFIC_SHIFT` and stall the deployment progress, unless ECS will immediately shift all production traffic to the green service tasks. At this point, I questioned the benefit of the outcome even if I was to get it to work versus its complexity. Frankly, it isn't worth it. But hey, the repo still serves as a great example of how to use B/G deployments in your CI/CD if you're into that.

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
