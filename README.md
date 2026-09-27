# Exprest — Live Train Tracking & Journey Intelligence

Exprest is a modern, high-precision train tracking and journey intelligence platform built for Indian Railways. It provides real-time track telemetry, live interactive map radar, microclimate weather tracking, journey analytics, and companion insights.

## Features

- **Live Radar Map:** Interactive MapLibre-powered dark radar map with glowing track geometry, real-time heading cones, and live speed & bearing tooltips.
- **Overview & Running Status:** Real-time train telemetry, route progress bar, station dwell time variance, and NTES status.
- **Journey Analytics:** Punctuality metrics, terminal arrival confidence, velocity analysis, station-by-station delay trends, and elevation profiles.
- **Travel Companion:** Station microclimate sensor array with OpenWeather API integration and route rain radar horizon.
- **Authentication & User Portal:** Modern Sign In and Registration flow with email/password and Google Sign-In options.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, TanStack Query, MapLibre GL
- **Backend:** Node.js, Fastify, TypeScript
- **Monorepo Management:** pnpm workspaces, Turborepo
- **APIs & Data:** RailRadar API, MapTiler, OpenWeather API

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/Sujalkan07/Exprest.git
cd Exprest

# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

The application will be running at:
- **Frontend App:** http://localhost:3000
- **API Server:** http://localhost:4000
