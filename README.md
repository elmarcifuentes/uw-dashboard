# UW Dashboard

## Local Development
```
npm install
npm run dev
```
Dashboard: http://localhost:3002
API:       http://localhost:3001

## Environment Variables
Frontend:  VITE_API_URL (default http://localhost:3001)
Backend:   PORT, ALLOWED_ORIGINS
Scoring:   DASHBOARD_API_URL

## Deployment
**Frontend → Vercel**
Set VITE_API_URL to your Railway/Render API URL
```
vercel --prod
```

**Backend → Railway or Render**
Uses render.yaml or Railway auto-detect
Set ALLOWED_ORIGINS to your Vercel URL

**Scoring engine**
Set DASHBOARD_API_URL to hosted API URL in .env
