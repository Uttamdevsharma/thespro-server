# 📌 ThesPro - Thesis & Project Management System (Server)

The robust and scalable backend for the ThesPro platform, built to securely handle complex university thesis workflows, multi-role authentications, and event-driven data distribution.

## 🚀 Live Links
- **Server Live URL:** [https://thespro-server.vercel.app](https://thespro-server.vercel.app)
- **Client Live URL:** [https://thespro-client.vercel.app](https://thespro-client.vercel.app)

## ✨ Features

- **Secure Authentication:** JSON Web Tokens (JWT) combined with Google OAuth2 login flows for robust identity verification.
- **RESTful Architecture:** Express router handling compartmentalized routes mapping perfectly to entity models.
- **Cloud Storage:** Native Multer buffers seamlessly integrated with Cloudinary for handling file uploads (e.g. notices, profile pictures).
- **Flexible Schema Management:** Robust NoSQL structuring using Mongoose for handling entities like Proposals, Defense Boards, Schedules, and Notices.
- **Serverless Ready:** Configured explicitly to run smoothly within a serverless Edge or Lambda environment like Vercel with cached DB connections.
- **Global Error Handling:** Clean async-handler wraps to ensure zero unhandled rejections or crashes.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js & TypeScript
- **Database:** MongoDB (Mongoose ORM)
- **Authentication:** JWT & Google Auth Library
- **File Handling:** Multer & Cloudinary
- **Deployment:** Vercel

## 🔐 Environment Variables (.env)

Create a `.env` file in the root of the server folder with the following variables:

```env
# Database
MONGO_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_super_secret_jwt_key

# Frontend Connection
FRONTEND_URL=https://thespro-client.vercel.app

# Cloudinary Setup
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth Setup
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
GOOGLE_CALLBACK_URL=your_callback_url_path
```

## 📂 Folder Structure

```text
src/
├── controllers/          # Business logic (e.g., authController.js, proposalController.js)
├── middleware/           # Route interceptors (auth check, role verify, upload limits)
├── models/               # Mongoose DB schemas (User, Notice, Proposal, DefenseBoard)
├── routes/               # Express routing logic grouping controller endpoints
├── lib/ & utils/         # Helper functions (DB connectors, environment validators)
├── app.ts                # Express application bootstrapping & global middlwares
└── index.ts              # Entry point 
```

## ⚙️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository_url>
   ```

2. **Navigate to the server directory**
   ```bash
   cd thespro-server
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Set up `.env`**
   Copy the example variables from above and supply the corresponding secrets.

5. **Run the development server**
   ```bash
   npm run dev
   ```

## 📦 Build & Deployment

**To compile the TypeScript project:**
```bash
npm run build
```

**Deployment:**
The backend is optimized and deployed via **Vercel** serverless functions. Builds compile to CommonJS/ESM via `tsup` and are exposed entirely from `api/index.js`, bypassing typical long-running `app.listen()` behaviors for serverless scalability.

## 👨‍💻 Author

**Name:** Uttam  
**Role:** Full Stack Developer
