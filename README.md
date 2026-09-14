# Quotation Management

A local-first desktop application for managing industrial-parts product data, supplier pricing, customer inquiries, quotations, and purchase-intent records.

The project is based on a real quotation workflow serving more than 200 buyers across 12 countries. It replaces scattered spreadsheets with a structured system that keeps product, supplier, customer, and quotation data connected.

## Highlights

- Maintains a bilingual product catalog with product numbers, Chinese and English names, weight, images, notes, and descriptions
- Supports multiple suppliers per product, each with independent pricing and lead-time data
- Connects customers, inquiries, line items, quotations, and PI records through a relational data model
- Imports and exports Excel workbooks with `exceljs`
- Stores data locally in SQLite with foreign keys, indexes, and WAL mode
- Packages the React and Express application as a Windows or macOS desktop app with Electron

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron, electron-builder |
| Frontend | React 18, Vite, React Router |
| Backend | Node.js, Express |
| Database | SQLite, better-sqlite3 |
| Files and spreadsheets | Multer, ExcelJS |

## Architecture

```text
Electron desktop shell
├── React client
│   ├── Dashboard
│   ├── Product database
│   ├── Customer inquiry workflow
│   ├── Customer management
│   └── Quotation database
└── Express API
    ├── Product and supplier routes
    ├── Customer and inquiry routes
    ├── Quotation and dashboard routes
    ├── Excel and PI file handling
    └── SQLite database
```

The database separates products from supplier offers so that one product number can have multiple suppliers without duplicating the core product record. Foreign-key relationships connect inquiry items and quotation records back to customers and uploaded PI documents.

## Run Locally

Requirements: Node.js 20+ and npm.

Install the client and server dependencies:

```bash
npm run install:all
```

Start the backend:

```bash
npm run dev:server
```

In a second terminal, start the frontend:

```bash
npm run dev:client
```

Open `http://localhost:5173`. The Vite development server proxies API requests to the Express server on port `3001`.

## Build the Desktop App

```bash
npm install
npm run dist:win
# or
npm run dist:mac
```

Build artifacts are written to `dist-app/`.

## Data Model

| Table | Purpose |
|---|---|
| `products` | Core product catalog |
| `product_suppliers` | Supplier-specific price and lead time |
| `customers` | Customer profiles and country data |
| `inquiries` | Customer inquiry headers |
| `inquiry_items` | Products, quantities, pricing, and deal status |
| `quotations` | Searchable quotation history |
| `pi_uploads` | Uploaded PI metadata and parsing results |

## Project Status

This repository is a functional local-first MVP. Core catalog, supplier, customer, inquiry, quotation, and desktop workflows are implemented. Template-specific import and PI parsing logic is still being refined against real business documents.

## Author

**Jay Da**  
M.S. Computer Science, Northeastern University  
[jayda@globalbiocaretech.com](mailto:jayda@globalbiocaretech.com)
