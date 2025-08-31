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
