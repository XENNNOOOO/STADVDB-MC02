# GO-Sales - Distributed Order Management System

## Overview

A modern, production-ready UI/UX implementation for a distributed database order management system built with Next.js 16, React 19, and Tailwind CSS.

## Features

### 1. Dashboard Homepage
- **Statistics Cards**: Real-time overview of total orders, revenue, node distribution, and year distribution
- **Visual Metrics**: Color-coded cards with icons for quick insights
- **Responsive Grid Layout**: Adapts to different screen sizes

### 2. Year-Based Filtering (2024/2025)
- **Prominent Year Filter**: Large, accessible buttons to filter orders by year
- **Node Context Display**: Shows which node is primary for each year
  - 2025 Orders → Node 1 Primary (Node 0 → Node 2 Failover)
  - 2024 Orders → Node 2 Primary (Node 0 → Node 1 Failover)
- **Real-time Filter Feedback**: Dynamic explanation of active filter

### 3. Enhanced Order List
- **Advanced Table View**: Modern, sortable table with hover effects
- **Node Status Indicators**: Color-coded badges showing which node accessed each order
- **Failover Status**: Visual indicators (Direct vs Failover) for each transaction
- **Quick Actions**: Eye icon (view details), Edit, Delete buttons
- **Order Detail Modal**: Click to view full order details with failover path visualization

### 4. Modern Order Form
- **Real-time Validation**: Instant feedback on form errors
- **Dynamic Order Items**: Add/remove products dynamically
- **Auto-calculated Totals**: Live subtotal and total amount calculation
- **Product Selection**: Dropdown with product names and prices
- **Date Validation**: Ensures delivery date is after order date
- **Visual Feedback**: Color-coded error states and success indicators

### 5. Node Status Display
- **Failover Path Visualization**: Step-by-step display of which nodes were attempted
- **Color-coded Nodes**:
  - Node 0 (Central Master): Blue
  - Node 1 (2025 Primary): Green
  - Node 2 (2024 Primary): Purple
- **Status Icons**: Direct access (✓) vs Failover (⚠️)

### 6. Recovery Control Panel
- **Node Health Status**: Live status display for all 3 nodes (Online/Degraded/Offline)
- **Pending Sync Recovery**: Button to trigger POST /api/recovery/sync
  - Purpose: Sync pending writes from Node 1/2 back to Node 0
- **Replication Recovery**: Button to trigger POST /api/recovery/replicate
  - Purpose: Re-replicate failed writes from Node 0 to replicas
- **Recovery Logs**: Timestamped log display with success/error indicators
- **Loading States**: Animated spinners during recovery operations

### 7. Loading & Error Handling
- **LoadingSpinner Component**: Customizable size (sm/md/lg) with optional messages
- **ErrorAlert Component**: Error and warning displays with retry/dismiss options
- **SuccessToast Component**: Auto-dismissing success notifications
- **Smooth Animations**: Slide-in and fade-in effects

## Tech Stack

- **Framework**: Next.js 16.0.1 with App Router
- **UI Library**: React 19.2.0
- **Styling**: Tailwind CSS 3.4.13
- **Icons**: Lucide React 0.407.0
- **Language**: TypeScript 5

## Project Structure

```
stadvdb-mco2/
├── app/
│   ├── components/
│   │   ├── DashboardStats.tsx       # Statistics cards
│   │   ├── YearFilter.tsx           # Year filter (2024/2025)
│   │   ├── OrderList.tsx            # Enhanced order table
│   │   ├── OrderForm.tsx            # Create/Edit order form
│   │   ├── Navbar.tsx               # Navigation with Recovery button
│   │   ├── NodeStatusIndicator.tsx  # Failover path visualization
│   │   ├── LoadingSpinner.tsx       # Loading component
│   │   ├── ErrorAlert.tsx           # Error display
│   │   └── SuccessToast.tsx         # Success notifications
│   ├── orders/
│   │   ├── new/page.tsx            # New order page
│   │   ├── [id]/page.tsx           # Edit order page
│   │   └── [id]/delete/page.tsx    # Delete confirmation
│   ├── recovery/
│   │   └── page.tsx                # Recovery control panel
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Home page (dashboard)
│   └── globals.css                 # Global styles & animations
├── public/                         # Static assets
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── tailwind.config.ts              # Tailwind config
├── next.config.mjs                 # Next.js config
└── README.md                       # This file
```

## Getting Started

### Installation

```bash
# Navigate to project directory
cd stadvdb-mco2

# Install dependencies
npm install

# Run development server
npm run dev
```

### Development Server

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## UI/UX Design Principles

### Color Scheme
- **Primary**: Blue (#2563eb) - Main actions, Node 0
- **Success**: Green (#16a34a) - Confirmations, Node 1
- **Warning**: Orange (#ea580c) - Failovers, alerts
- **Error**: Red (#dc2626) - Errors, deletions
- **Purple**: (#9333ea) - Node 2, alternative actions

### Typography
- **Headings**: Bold, clear hierarchy (3xl, 2xl, xl, lg)
- **Body**: Readable sans-serif font stack
- **Font Smoothing**: Enabled for crisp text rendering

### Spacing & Layout
- **Container**: Max-width 7xl (1280px) with responsive padding
- **Grid System**: Responsive grids (1/2/3/4 columns based on screen size)
- **Consistent Spacing**: 6-unit spacing system (1.5rem)

### Interactive Elements
- **Hover Effects**: Subtle transitions on all interactive elements
- **Loading States**: Spinner animations with disabled states
- **Validation Feedback**: Real-time error messages with color coding
- **Smooth Animations**: 300ms ease-out transitions

## API Integration Points (Ready for Backend)

The UI is built with clear API integration points:

### Order CRUD Operations
- **GET /api/orders** - Fetch all orders
- **GET /api/orders/:id** - Fetch single order
- **POST /api/orders** - Create new order
- **PUT /api/orders/:id** - Update order
- **DELETE /api/orders/:id** - Delete order

### Recovery Operations
- **POST /api/recovery/sync** - Run pending sync recovery
- **POST /api/recovery/replicate** - Run replication recovery
- **GET /api/recovery/logs** - Fetch recovery logs

### Node Status
- **GET /api/nodes/status** - Fetch all node statuses

## Mock Data

Currently uses mock data for demonstration:

- **Orders**: 6 sample orders across 2024 and 2025
- **Products**: 5 sample products with prices
- **Node Statuses**: Simulated online/degraded/offline states
- **Recovery Logs**: Sample sync and replication logs

## Next Steps for Backend Integration

1. Replace mock data with API calls
2. Implement actual endpoints in `/api` routes
3. Connect to database-connection branch logic
4. Add authentication/authorization
5. Implement real-time node status monitoring
6. Add WebSocket support for live updates

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

Private academic project - STADVDB MCO2
