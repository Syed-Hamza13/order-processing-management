# Eklavya Pitara — Order & Label Management System

A local, single-admin web app for Eklavya Foundation's Eklavya Pitara program: define custom
order forms, manage orders in an Excel-like table, design label templates on a canvas editor,
and print address labels — replacing the old heavy Word-document workflow.

This build is set up to run **locally** (localhost + your machine's LAN IP).
---

## 1. Stack

- Frontend: React (Vite) + Tailwind CSS + Fabric.js
- Backend: Node.js + Express
- Database: MySQL

---

## 2. Prerequisites

Before installing the application, make sure the following are installed and available:

- Node.js 18+ and npm
- MySQL 8+
- MySQL server must be running
- A MySQL database created for this application
- A MySQL user with permission to access that database

---

# 3. Database Setup

The application **does not create the MySQL database itself**.

The database must be created manually by the database administrator before starting the
backend.

The application only creates/checks the required **tables** inside the database.

## 3.1 Create the Database

Log in to MySQL:

```bash
mysql -u root -p  or through phpmyadmin

## 4. Backend Setup

```bash
cd backend
cp .env.example .env

# edit .env: set 
PORT=4000
DB_HOST=  #db host
DB_PORT=3306
DB_USER= #db user
DB_PASSWORD= #db user password
DB_NAME= #db name

# Long random string used to sign login session tokens (JWT). Generate your own.
JWT_SECRET= # a long string

# after setting all than run the followng commands
npm install
npm run dev

```

The backend runs on `http://localhost:4000` by default (and is reachable from other devices
on your network at `http://<your-machine-LAN-IP>:4000`, since it listens on `0.0.0.0`).

**Important:** once you know your machine's LAN IP (e.g. `192.168.1.50`), add it to
`CORS_ORIGINS` in `backend/.env`, e.g.:
```
CORS_ORIGINS=http://localhost:5173,http://192.168.1.50:5173
```

````md

## 5. Frontend Setup

Run the following commands:

```bash
cd frontend

cp .env.example .env
npm install
npm run dev
````

Configure the frontend using the `frontend/.env` file.

Example:

```env
VITE_API_URL=http://localhost:4000
VITE_PORT=8075
```

### Frontend Port

The frontend development server port is controlled through the `VITE_PORT` environment variable.

For example:

```env
VITE_PORT=5173
```

The frontend will then be available at:

```text
http://localhost:5173
```

Vite is configured with `host: true`, so the frontend can also be accessed from other devices on the same local network using the machine's LAN IP:

```text
http://<your-machine-LAN-IP>:5173
```

If `VITE_PORT` is not specified, the frontend falls back to Vite's default port:

```text
5173
```

### Backend API URL

The backend API URL is configured through the `VITE_API_URL` environment variable:

```env
VITE_API_URL=http://localhost:4000
```

If the backend is running on another machine or hostname, change it accordingly:

```env
VITE_API_URL=http://<backend-host>:4000
```

After changing `VITE_PORT` or `VITE_API_URL`, restart the frontend development server:

```bash
npm run dev
```

> **Note:** `VITE_PORT` controls the frontend development/preview server port, while `VITE_API_URL` controls which backend API the frontend connects to. These are independent settings.

```
```


## 6. First Run

Open the frontend in your browser. Since no admin user exists yet, you'll see the **one-time
Setup screen** asking for an email, password, and retype password. Email doubles as your
username — there's no separate username field. After setup, you'll be taken to the login screen.

## 7. Using the App — Suggested First-Time Flow

1. **Fields** — create the data fields you need (Customer Name, Address, Mobile Number, Pincode,
   Order Date, etc.), picking the right type for each (Short Text, Multiline Text, Number, Date,
   Dropdown, Toggle).
2. **Dropdowns** — if any field needs a dropdown (e.g. "Region" or "Delivery Mode"), create the
   dropdown and its options first, so it's available when defining that Field.
3. **Forms** — create a Form and select which Fields it should contain; drag to reorder them.
4. **Orders** — the first time you open Orders, you'll be asked to pick which Form drives the
   Orders table. After that, you can add orders, search, filter per column, bulk edit/delete,
   import/export Excel, and select orders to print.
5. **Template Editor** — design your label: pick a page size (A3/A4/A5/Letter/Envelope) and
   orientation, add text/shapes/images, and drag in **Field Placeholders** (linked to your Orders
   fields), plus the **Consignment** and **Number of Boxes** placeholders for print-time options.
   Save the template, and optionally mark it as default.
6. **Print** — in Orders, select one or more orders, click Print, adjust number of boxes and
   consignment options per order (or apply a box count to everyone at once), and print.

## 8. A Few Implementation Notes (read before relying on edge cases)

These are reasonable, working choices made to keep the system maintainable — flagging them so
nothing feels like a silent surprise:

- **Order search/filter/sort** happens in the backend after loading all of that form's orders
  into memory (not raw SQL `WHERE`/`LIKE` on the JSON column). This is simple and fast for the
  realistic scale of a single office's orders. If your order volume grows into the tens of
  thousands and listing feels slow, this is the first place to optimize (e.g. generated/indexed
  columns for the most-searched fields).
- **Excel import matching:** the **first field in your Orders form** is used as the unique key
  to detect duplicates on re-import (e.g. make it "Order Number" or another value that's unique
  per order). Re-uploading a file with the same key value updates that order instead of creating
  a duplicate; a new key value inserts a new order. This is documented on the downloadable import
  template too.
- **Image cropping** in the Template Editor works by dragging a crop-window rectangle over an
  image and clicking "Apply Crop" — this works regardless of the image's rotation, since the crop
  rectangle is defined in canvas coordinates.
- **Physical print accuracy:** the canvas is sized to true physical dimensions (A4 = 210×297mm,
  etc. at 96 DPI). For the printed output to match exactly, print at **100% scale / "Actual Size"**
  in your browser's print dialog (not "Fit to page"). Envelope size is set to a common DL size
  (110×220mm) as a starting point — adjust `frontend/src/utils/pageSizes.js` if your office uses
  a different envelope.
- **Security:** the backend uses Helmet, CORS allow-listing, rate limiting (tighter on login),
  httpOnly cookies for the session, parameterized SQL queries everywhere (no string-built SQL,
  so no SQL injection surface), and CSRF tokens (double-submit cookie pattern via `csurf`) on
  every state-changing request.
- **Dockerization** was intentionally left out of this pass, as requested — the app runs directly
  with Node/npm and a local MySQL instance for now. When you're ready, the natural next step is a
  `Dockerfile` for `backend/`, a static build + `Dockerfile` for `frontend/` (or serving the built
  frontend from the backend), and a `docker-compose.yml` adding a `mysql` service — say the word
  and that can be built out next.

## 9. Project Structure

```
|-- README.md
|-- backend
  |-- .env
  |-- .env.example
  |-- .gitignore
  |-- package-lock.json
  |-- package.json
  |-- sql
    |-- schema.sql
  |-- src
    |-- db.js
    |-- index.js
    |-- middleware
      |-- auth.js
      |-- errorHandler.js
    |-- utils
      |-- usage.js
    |-- routes
      |-- assets.js
      |-- auth.js
      |-- dropdowns.js
      |-- fields.js
      |-- forms.js
      |-- orders.js
      |-- pincode.js
      |-- settings.js
      |-- templates.js
    |-- {routes,middleware,utils}
  |-- uploads
    |-- assets
      // your uploaded assets
    |-- branding
       // your uploaded assets
|-- frontend
  |-- .env
  |-- .env.example
  |-- .gitignore
  |-- index.html
  |-- package-lock.json
  |-- package.json
  |-- postcss.config.js
  |-- tailwind.config.js
  |-- vite.config.js
  |-- dist
    |-- index.html
    |-- assets
      |-- index-BjRSnJ10.js
      |-- index-BuLPp5IO.css
      |-- index-CXPich2x.css
      |-- index-DEySskwT.css
      |-- index-dQR3LUxB.js
      |-- index-DS08mRkf.js
  |-- src
    |-- api.js
    |-- App.jsx
    |-- index.css
    |-- main.jsx
    |-- components
      |-- ConfirmDialog.jsx
      |-- FormRenderer.jsx
      |-- PrintPreview.jsx
      |-- Sidebar.jsx
    |-- context
      |-- AuthContext.jsx
      |-- ToastContext.jsx
    |-- pages
      |-- Assets.jsx
      |-- Dropdowns.jsx
      |-- Fields.jsx
      |-- Forms.jsx
      |-- Login.jsx
      |-- Orders.jsx
      |-- Settings.jsx
      |-- Setup.jsx
      |-- TemplateEditor.jsx
    |-- utils
      |-- date.js
      |-- pageSizes.js
      |-- pincode.js
    |-- {pages,components,context}

```
