# Blinksy

Blinksy is a social camera application inspired by Snapchat. It is built with React Native, Expo, TypeScript, and Supabase.

The application brings together camera capture, sharing, friends, messaging, Stories, profiles, and notifications.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Supabase Configuration](#supabase-configuration)
- [Running the Application](#running-the-application)
- [Type Checking](#type-checking)
- [Troubleshooting](#troubleshooting)
- [Security Guidelines](#security-guidelines)

## Features

- User registration and login
- User profiles with editable display names, usernames, and profile photos
- Camera photo capture and video recording
- Saving captured media to the device gallery where supported
- Friend requests and friend management
- Direct messaging and real-time chat
- Image and video messaging
- Message read receipts and unread indicators
- Stories and story views
- In-app notifications
- Supabase authentication, database, Realtime, and file storage integration

Blinksy is under active development. Feature availability may change as the project evolves.

## Technology Stack

| Technology          | Purpose                             |
| ------------------- | ----------------------------------- |
| React Native        | Cross-platform application UI       |
| Expo                | Development and application runtime |
| TypeScript          | Type-safe application development   |
| Expo Router         | File-based navigation               |
| Supabase Auth       | User authentication                 |
| Supabase PostgreSQL | Application database                |
| Supabase Realtime   | Real-time messaging and updates     |
| Supabase Storage    | Profile pictures and media          |

## Project Structure

```text
Blinksy/
├── mobile/
│   └── src/
│       ├── app/           # Application screens and routes
│       ├── components/    # Reusable UI components
│       ├── constants/     # Shared constants
│       └── lib/           # Supabase client and service modules
├── web/                   # Web application workspace
├── backend/               # Backend workspace
├── .gitignore
└── README.md
```

The mobile application is the primary active application. Check the `web/` and `backend/` directories for their own dependencies and setup instructions before running those workspaces.

## Prerequisites

Install the following before starting:

- Git
- Node.js and npm compatible with the project's Expo SDK and dependencies
- A Supabase project
- Expo Go on an Android device for physical-device testing

Use the Node.js version compatible with the versions specified in `mobile/package.json`.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Preeti-dev-97/Blinksy.git
cd Blinksy
```

### 2. Install dependencies

```bash
cd mobile
npm install
```

Run subsequent mobile commands from the `mobile/` directory unless otherwise specified.

### 3. Configure environment variables

Create a `.env` file inside `mobile/`.

Add your Supabase project URL and public client key:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLIC_CLIENT_KEY
```

Replace the placeholders with the values from your Supabase project.

The variable names must match those referenced by `mobile/src/lib/supabase.ts`. If that file uses different names, follow the implementation in that file.

**Never put a Supabase `service_role` key in the mobile application.** Variables prefixed with `EXPO_PUBLIC_` are exposed to the client and must not contain private secrets.

## Supabase Configuration

Blinksy relies on Supabase for authentication, database operations, real-time updates, and media storage.

A newly created Supabase project does not automatically contain Blinksy's database schema and policies. Configure the following before testing the complete application.

### Database

The application uses tables including:

- `profiles`
- `friend_requests`
- `conversations`
- `conversation_members`
- `messages`
- `notifications`
- `stories`
- `story_views`

Some workflows also depend on database functions, triggers, indexes, Row Level Security (RLS) policies, and Realtime publication settings.

Use the SQL migrations associated with the project to create these objects.

**Repository maintenance requirement:** If the SQL currently exists only in the original developer's Supabase SQL Editor history, export and review it, remove any secrets, and commit reproducible migration files to the repository. Without those migrations, another developer cannot reliably recreate the database from a fresh Supabase project using this README alone.

Do not disable RLS as a workaround for database permission errors.

### Authentication

Configure Supabase Authentication for the project's sign-up and sign-in flow.

Review the email-confirmation settings and configure the local development URLs where required.

### Realtime

Enable Realtime for the tables used by the application.

Verify that the necessary tables are included in the `supabase_realtime` publication and that their RLS policies allow authenticated users to receive only the data they are authorized to access.

### Storage

Create the storage buckets required by the application and its SQL setup.

The profile editor expects a bucket named `profile-avatars`. Stories use private storage and signed URLs in the current implementation.

Check the application's upload services for any additional buckets required by chat media.

Configure appropriate Storage policies to prevent users from accessing or modifying files belonging to other users.

## Running the Application

### Start the development server

From `mobile/`:

```bash
npx expo start
```

### Run on the web

Start the Expo development server and press `w`, or run:

```bash
npx expo start --web
```

### Run on Android using Expo Go

1. Install Expo Go on your Android device.

2. Connect your computer and phone to the same network.

3. From `mobile/`, run:

   ```bash
   npx expo start
   ```

4. Scan the QR code using Expo Go.

5. Open Blinksy and test the required features.

If the device cannot connect to the development server, check your firewall and local network. You can also try:

```bash
npx expo start --tunnel
```

Some native features may behave differently in Expo Go than in a development or production build. Follow the existing project's Expo workflow rather than running `expo prebuild` unnecessarily.

## Type Checking

From `mobile/`, run:

```bash
npx tsc --noEmit
```

Run this command after making TypeScript changes to identify type errors.

To restart Expo and clear its cache:

```bash
npx expo start -c
```

## Troubleshooting

### Supabase authentication or connection errors

- Verify the project URL and public client key.
- Confirm the `.env` file is inside `mobile/`.
- Check that environment variable names match `mobile/src/lib/supabase.ts`.
- Restart Expo after changing environment variables.
- Review Supabase Auth settings and application logs.

### Database permission errors

- Verify that the required tables and columns exist.
- Check RLS policies for the affected operation.
- Confirm that required database functions and triggers are installed.
- Do not disable RLS to bypass the error.

### Realtime subscription errors

- Check that Supabase Realtime is available.
- Verify that the required tables are included in the Realtime publication.
- Review the relevant RLS policies.
- Check browser extensions, firewalls, VPNs, and network restrictions that may block WebSocket connections.
- Inspect the actual channel subscription status and Supabase logs.

### Expo serves stale code

Stop the development server and run:

```bash
npx expo start -c
```

### Dependency or Node.js errors

Check the versions in `mobile/package.json` before upgrading Node.js, Expo, or React Native dependencies. These packages must remain compatible with the project's Expo SDK.

## Security Guidelines

- Never commit `.env` files or private credentials.
- Keep `.env.example` updated with variable names and placeholder values only.
- Never expose Supabase service-role credentials in the mobile app.
- Enforce access control using database RLS and Storage policies.
- Keep private media in private buckets and use authorized access mechanisms.
- Never commit production user data or credentials.

## Contributing

1. Clone the repository and follow the setup instructions.
2. Create a branch for your changes.
3. Follow the existing TypeScript and project conventions.
4. Include database migrations when adding or changing database objects.
5. Run `npx tsc --noEmit` from `mobile/`.
6. Test affected functionality on web and, where applicable, Android using Expo Go.
7. Update this README whenever setup instructions or required environment variables change.
