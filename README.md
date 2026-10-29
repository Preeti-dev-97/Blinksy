# Blinksy

**Capture it. Share it. Live it.**

Blinksy is a social camera application designed to help users capture and share moments, connect with friends, view stories, and communicate through chats.

This repository contains the Blinksy application source code. This guide explains how to configure the project for local development, test it, and prepare it for production deployment.

> **For developers:** Read the complete setup instructions before deploying. Verify the existing environment variables, Supabase configuration, application routes, and Expo settings before making production changes.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started Locally](#getting-started-locally)
- [Supabase Configuration](#supabase-configuration)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Testing and Validation](#testing-and-validation)
- [Production Deployment](#production-deployment)
- [Production Security Checklist](#production-security-checklist)
- [Troubleshooting](#troubleshooting)
- [Developer Handover Checklist](#developer-handover-checklist)

---

## Project Overview

Blinksy is built with Expo and React Native, with Expo Router for application navigation and Supabase for backend services.

The project supports development and testing on compatible web browsers and Android devices. The exact production configuration, hosting provider, application identifiers, and release settings must be verified before deployment.

### Features

The current application includes the following areas:

- User registration and login
- User profiles and profile editing
- Camera functionality for capturing photos and videos
- Saving captured media to the device gallery
- Stories
- Chats and messaging
- Friends and friend requests
- Notifications
- Supabase-backed data and authentication

The availability and completeness of individual features should be verified against the current source code before a production release.

---

## Technology Stack

| Area                   | Technology                                                  |
| ---------------------- | ----------------------------------------------------------- |
| Mobile application     | React Native                                                |
| Application framework  | Expo                                                        |
| Navigation             | Expo Router                                                 |
| Backend services       | Supabase                                                    |
| Authentication         | Supabase Auth                                               |
| Database               | Supabase PostgreSQL                                         |
| Realtime functionality | Supabase Realtime                                           |
| Media storage          | Supabase Storage and device media library, where applicable |
| Language               | TypeScript                                                  |
| Package management     | npm                                                         |
| Version control        | Git                                                         |

Check `mobile/package.json` and the application configuration files for the exact package versions and enabled capabilities.

---

## Project Structure

The repository is organized into the following main areas:

```text
Blinksy/
├── mobile/
│   ├── src/
│   │   ├── app/             # Application screens and routes
│   │   ├── components/      # Reusable UI components
│   │   ├── constants/       # Application constants
│   │   ├── hooks/           # Reusable hooks
│   │   └── lib/             # Supabase and service modules
│   ├── assets/              # Images, icons, and other assets
│   ├── app.json             # Expo application configuration
│   ├── package.json         # Dependencies and scripts
│   └── tsconfig.json        # TypeScript configuration
├── backend/                 # Backend-related code, if applicable
├── web/                     # Web-related code, if applicable
└── README.md
```

Some directories may change as development continues. Inspect the current repository before assuming that `backend/` or `web/` is independently deployable. The Expo application's web output may be generated from the `mobile/` project.

---

## Prerequisites

Install the following tools before starting:

- **Node.js:** Use a version supported by the project's installed Expo SDK and dependencies.
- **npm:** Installed with Node.js.
- **Git:** For cloning and managing the repository.
- **Visual Studio Code** or another suitable code editor.
- **Supabase access:** Required to configure the database, authentication, storage, and realtime functionality.
- **Expo Go:** Useful for testing compatible Android features during development.
- **Web browser:** Required for web testing.

For production deployment, additional access may be needed:

- Web hosting account
- Supabase production project
- Google Play Console account for Android distribution
- Apple Developer account for iOS distribution, if applicable

---

## Getting Started Locally

### 1. Clone the Repository

```bash
git clone <REPOSITORY_URL>
cd Blinksy
```

Replace `<REPOSITORY_URL>` with the repository URL supplied by the project owner.

If the repository is private, ensure that your Git account has access.

### 2. Install Dependencies

Navigate to the mobile project:

```bash
cd mobile
npm install
```

Use the package lockfile committed to the repository to maintain consistent dependency versions.

Avoid upgrading Expo, React Native, or other major dependencies during initial setup unless the upgrade is intentional.

### 3. Configure Environment Variables

Create a local environment file in the directory expected by the Supabase client configuration.

For example, if the application reads environment variables from `mobile/.env`, create:

```text
mobile/.env
```

Add the following values:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLIC_CLIENT_KEY
```

Replace the placeholders with the appropriate values from the Supabase project.

**Important:** Before creating the environment file, inspect the existing Supabase client module, expected to be under `mobile/src/lib/`. Use the exact environment variable names already referenced by the code. Do not rename existing variables without updating all corresponding references.

If the project uses a different environment file or variable naming convention, follow the existing implementation.

Do not commit `.env` files containing credentials. Confirm that local environment files are excluded through `.gitignore`.

### 4. Verify the Supabase Connection

Before starting the application, confirm that:

- The Supabase project is accessible.
- The project URL is correct.
- The client key is correct.
- The Supabase client reads the configured environment variables.
- Authentication and database requests can reach the configured project.

If the environment configuration changes while Expo is running, restart the development server.

---

## Supabase Configuration

Blinksy relies on Supabase for backend functionality. A developer setting up the project must verify that the database schema, permissions, authentication settings, storage, and realtime configuration are available.

### 1. Database Schema

The existing application uses tables and database functionality for areas such as:

- `profiles`
- `conversations`
- `conversation_members`
- `messages`
- Friend requests
- Notifications
- Stories and story views

The exact schema, column definitions, constraints, indexes, database functions, triggers, and relationships must be taken from the project's existing SQL or the current Supabase database.

**Do not create replacement tables based only on this list.** Inspect the application queries and the existing database schema first.

### 2. Database migrations

The `supabase/migrations/` directory contains the database setup
scripts in chronological order.

1. `20261029000100_blinksy_schema.sql`
   Creates the eight application tables, constraints, indexes,
   and enables RLS.

2. `20261029000200_blinksy_functions_triggers.sql`
   Creates application functions and triggers.

3. `20261029000300_blinksy_policies_realtime.sql`
   Creates RLS policies and configures Realtime tables.

4. `20261029000400_blinksy_storage.sql`
   Creates Storage buckets and their access policies.

## Before deploying

These migration files were reconstructed from the schema metadata
collected from the existing Supabase project.

Before using them in production, the developer must:

- Compare function definitions against the source Supabase project.
- Confirm database grants and function execution privileges.
- Confirm Storage upload paths match the mobile application.
- Test RLS policies using authenticated test accounts.
- Run the complete migration sequence on a fresh staging project.
- Test signup, login, friend requests, chats, notifications,
  Snap opening, stories, and media uploads.

Do not apply the migrations to the existing production project
without first checking for existing objects and conflicts.

## Supabase configuration

Configure the following environment variables for the mobile app,
using the project's existing environment-variable naming convention:

- Supabase project URL
- Supabase publishable/anon key

Never place the Supabase service-role key in the mobile application.

The project reference collected during development is:

`vnctrrtkyqvhiycacidv`

The project reference is not a substitute for the project URL
or API key.

## Fresh database setup

1. Create a new Supabase project.
2. Ensure the standard Supabase `auth` and `storage` schemas
   are available.
3. Review and validate all four migration files.
4. Apply the migrations in timestamp order.
5. Confirm all eight application tables exist.
6. Confirm RLS is enabled on all eight tables.
7. Confirm the three Storage buckets and policies exist.
8. Confirm `messages` and `notifications` are included in
   `supabase_realtime`.
9. Configure the mobile app's Supabase environment variables.
10. Run the acceptance tests below.

## Acceptance tests

### Authentication

- Sign up with a new email.
- Confirm a profile is created for the Auth user.
- Sign in and sign out.
- Confirm one user cannot update another user's profile.

### Friend requests

- Send a request between two test accounts.
- Accept and reject requests.
- Cancel an outgoing pending request.
- Verify the notification records.
- Verify unrelated users cannot access the relationship records.

### Messaging

- Create a direct conversation.
- Verify both participants are members.
- Send and receive text messages.
- Verify notifications are generated.
- Verify non-members cannot read messages.
- Test image and video uploads.

### Snaps

- Send a Snap.
- Open it from the recipient account.
- Confirm opening metadata is recorded.
- Confirm it cannot be opened a second time.

### Stories

- Upload an image and a video story.
- Verify visibility for owners, friends, and public stories.
- Record a story view.
- Verify expired stories are not returned.

### Storage

- Upload a profile avatar.
- Upload chat media as a conversation member.
- Upload story media.
- Verify unauthorized users cannot read private chat media.

## Important deployment note

These scripts represent the collected application schema,
but they are not yet a verified production release.

The developer should compare them with the original database
definitions and run the complete test suite against a fresh
Supabase project before deploying the mobile app.

### 3. Row-Level Security

Verify that Row-Level Security (RLS) is enabled where appropriate and that the existing policies support the intended application behavior.

Check access rules for:

- Profiles
- Conversations and conversation members
- Messages
- Friend requests
- Notifications
- Stories and story views
- Storage objects

Policies must prevent users from reading or modifying data they are not authorized to access.

Test access using separate user accounts. A successful query using an administrator or privileged key is not proof that normal authenticated users have the correct permissions.

### 4. Authentication

Verify the authentication settings in the Supabase dashboard:

- Email/password authentication is configured as expected.
- Email confirmation behavior is intentional.
- Signup and login work.
- Password reset and email confirmation redirects are configured when those flows are implemented.
- Production redirect URLs use the production domain or application URL scheme, as appropriate.

Use separate test accounts during development. Do not use real users' credentials for testing.

### 5. Realtime

Blinksy uses Supabase Realtime for features that require updates without refreshing the screen.

Verify that:

- Required tables are enabled for the appropriate Realtime publication.
- RLS policies permit authorized users to receive the intended updates.
- Subscriptions connect successfully.
- Subscriptions are cleaned up when screens unmount.
- Reconnection and error handling behave correctly.

Realtime functionality should be tested with two separate accounts before release.

### 6. Storage

Inspect the current code to identify the storage buckets used by the application, including profile images and any other uploaded media.

For every required bucket, verify:

- The bucket exists in the correct Supabase project.
- Public or private access matches the intended use.
- Storage policies authorize only the intended operations.
- Upload size and allowed file types are appropriately restricted.
- Uploaded files can be retrieved by authorized users.

If a bucket uses public URLs, confirm that its contents are intended to be publicly accessible. Do not make private user media public merely to simplify URL handling.

### 7. Database Functions and Triggers

If the application relies on RPC functions, database functions, triggers, or scheduled database tasks, ensure these are included in the setup documentation and available in the target environment.

Test the existing functions used by features such as conversation creation and friend requests.

---

## Running the Application

Run commands from the `mobile/` directory unless stated otherwise.

### Start the Development Server

```bash
npx expo start
```

This starts the Expo development server.

### Run on Android with Expo Go

1. Install Expo Go on a compatible Android device.
2. Ensure the device and development computer can communicate over the network.
3. Start the development server using `npx expo start`.
4. Scan the QR code with Expo Go.
5. Test the application on the device.

If the network prevents the device from connecting, try:

```bash
npx expo start --tunnel
```

Some native capabilities, permissions, or production-specific behavior may differ between Expo Go and a standalone production build.

### Run on the Web

```bash
npx expo start --web
```

Test the web experience separately from Android. A feature working on Android does not guarantee that it works in a browser, and vice versa.

### Clear the Expo Cache

If stale bundles or unexpected module-resolution problems occur:

```bash
npx expo start -c
```

---

## Testing and Validation

Before making changes or preparing a release, validate the existing implementation.

### TypeScript Check

If the project supports the following script:

```bash
npx tsc --noEmit
```

Resolve relevant TypeScript errors before deployment. If the repository defines a dedicated type-checking script, use that script as well.

### Functional Testing

At minimum, test the following flows:

| Area           | Validation                                                          |
| -------------- | ------------------------------------------------------------------- |
| Authentication | Register, log in, and log out                                       |
| Profiles       | View and update profile information                                 |
| Profile images | Upload and retrieve images according to access rules                |
| Camera         | Capture a photo and record a video                                  |
| Media          | Preview, save, and retrieve media as supported                      |
| Friends        | Send, receive, accept, and reject friend requests where implemented |
| Chats          | Create or open conversations and send messages                      |
| Realtime       | Verify updates between two test accounts                            |
| Stories        | Create and view stories where implemented                           |
| Notifications  | Verify notification creation, visibility, and updates               |
| Web            | Test supported flows in a browser                                   |
| Android        | Test supported flows on a physical device                           |

Do not consider a feature production-ready simply because its screen opens. Validate its database access, error handling, permissions, and behavior using ordinary user accounts.

---

## Production Deployment

**Local development and production deployment are separate environments.** Keep local development working first, then prepare and verify the production configuration.

The production developer should coordinate access to the hosting provider, Supabase project, and app-distribution accounts with the project owner.

### 1. Create or Confirm the Production Supabase Project

Prefer a dedicated production Supabase project rather than using development data for live users.

The production project should contain the verified:

- Database schema and migrations
- RLS policies
- Required database functions and triggers
- Authentication configuration
- Realtime publication settings
- Storage buckets and storage policies

Apply the approved schema and configuration to production. Do not copy test users, development secrets, or unnecessary personal data into production.

After setup, verify authentication, database access, storage uploads, and realtime behavior using production test accounts.

### 2. Configure Production Environment Variables

Configure the production environment variables through the relevant hosting or build system.

For the Supabase client, use the variable names required by the application, for example:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PRODUCTION_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PRODUCTION_SUPABASE_PUBLIC_CLIENT_KEY
```

These names are examples and must match the existing source code.

Expo public environment variables are bundled into the client application. They must not contain passwords, service-role keys, database credentials, or other server-only secrets.

If a server-side backend is used, keep its private credentials in the backend's secure environment configuration.

### 3. Deploy the Web Application

The exact deployment process depends on the chosen hosting provider and the current Expo web configuration.

Before deploying, confirm:

- The web application builds successfully.
- The correct production environment variables are configured.
- All required routes work on direct navigation and page refresh.
- Authentication redirects and callback URLs use the production domain.
- Browser permissions and media APIs behave as expected.
- The hosting provider is configured to serve the generated application correctly.

For a standard Expo web export, inspect the project's Expo configuration and supported export options. A common starting point is:

```bash
npx expo export --platform web
```

Run this from the `mobile/` directory only after verifying that the project supports this export configuration.

The generated output directory depends on the Expo configuration and SDK version. Confirm the actual output and configure the selected host to serve that output.

The build command alone does not publish the website. The developer must configure the hosting provider, upload or deploy the build, connect the domain if required, and verify the live site.

### 4. Prepare the Android Production Build

Expo Go is intended for development and testing, not for distributing the final application to users.

Before building the Android release, confirm:

- The production app name and Android application identifier are correct.
- The app icon and splash screen are configured.
- Required permissions are appropriate for the released features.
- The production Supabase environment is used.
- The release version and build number are correct.
- Camera, microphone, media-library, authentication, and network behavior have been tested in a standalone build.

If the project uses Expo Application Services (EAS), inspect the current Expo configuration and EAS setup before proceeding.

A typical EAS workflow is:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android
```

These commands are a starting point, not a guarantee that the current project is ready to build. The developer must verify the Expo SDK compatibility, build configuration, application identifier, signing configuration, and any required native settings.

An Android App Bundle (`.aab`) is generally used for Google Play distribution. Follow the current Google Play Console requirements for testing and publishing.

A successful build does not automatically publish the application to Google Play.

### 5. Prepare an iOS Release (If Required)

If Blinksy will also be released on iOS, the developer must verify iOS configuration, required permissions, bundle identifier, signing, and device testing.

An appropriate Apple Developer account and a compatible build and distribution workflow will be required for public distribution.

iOS release readiness should be assessed separately from Android and web readiness.

### 6. Production Authentication and Domains

Before release, configure the correct production URLs in Supabase authentication settings.

Verify:

- The production website URL.
- Allowed redirect URLs for login, email confirmation, and password reset flows, where implemented.
- Any application deep-link or URL scheme required by the mobile application.
- The behavior of authentication links when opened on mobile and web.

Do not use localhost URLs as production redirect URLs unless a specific development workflow requires them.

### 7. Verify the Live Application

After deployment, perform a smoke test against the actual production environment.

At minimum:

1. Open the deployed website or install the release build.
2. Register or log in with a test account.
3. Verify profile retrieval and updates.
4. Test camera and media features on supported devices.
5. Test friend requests and chats with two accounts.
6. Verify realtime updates and notifications where implemented.
7. Confirm that unauthorized database and storage access is rejected.
8. Check application logs and Supabase logs for errors.

Only release to real users after the required flows have been validated.

---

## Production Security Checklist

Before release, confirm the following:

- [ ] No passwords, service-role keys, or private credentials are committed to Git.
- [ ] `.env` and other local secret files are excluded from version control.
- [ ] Only appropriate public client configuration is bundled into the mobile or web client.
- [ ] RLS policies are enabled and tested on relevant tables.
- [ ] Storage permissions are reviewed and tested.
- [ ] RPC functions and privileged database operations are appropriately restricted.
- [ ] Authentication redirects use approved production URLs.
- [ ] User media is not unintentionally public.
- [ ] Production data is separate from development and test data.
- [ ] Errors are handled without exposing private information.
- [ ] Camera, microphone, and media permissions match the actual functionality.
- [ ] The app is tested on a standalone release build, not only Expo Go.
- [ ] Backup, monitoring, and recovery arrangements are understood by the project owner.

Never put a Supabase service-role key in an Expo public environment variable or in code that runs on a user's device.

---

## Troubleshooting

### Supabase Connection Errors

Verify:

- The environment variable names match the source code.
- The URL and public client key belong to the intended Supabase project.
- The development server has been restarted after environment changes.
- The device or browser can access the network.

### Authentication Errors

Check:

- Supabase Auth configuration.
- Email confirmation settings.
- Allowed redirect URLs.
- Network responses and Supabase Auth logs.
- Whether the user account exists and is confirmed when confirmation is required.

### Database Permission Errors

Check the relevant RLS policies and database grants. Confirm that the request is running with the expected authenticated user.

Do not disable RLS as a shortcut to make the application work.

### Realtime Connection Problems

Check:

- Realtime publication settings.
- Table permissions and RLS policies.
- WebSocket connectivity.
- Subscription lifecycle and cleanup.
- Supabase logs and client-side subscription status.

Test with two independent accounts to confirm that updates are delivered only to authorized users.

### Camera or Media Issues

Check:

- Device permissions.
- Expo SDK and package compatibility.
- Whether the feature is running in Expo Go, a browser, or a standalone build.
- Platform-specific media-library behavior.
- The device's available storage.

Test on physical devices before releasing camera-related functionality.

### Expo Bundling or Cache Problems

Try:

```bash
npx expo start -c
```

If the issue persists, inspect the error output and verify package compatibility before changing dependency versions.

---

## Developer Handover Checklist

Before considering the project ready for live deployment, the receiving developer should complete the following:

- [ ] Clone the repository and install dependencies.
- [ ] Confirm the actual project structure and available package scripts.
- [ ] Configure local environment variables.
- [ ] Obtain access to the appropriate Supabase project.
- [ ] Verify the schema, migrations, functions, RLS policies, storage, and realtime configuration.
- [ ] Run the application on web and Android.
- [ ] Resolve blocking errors and test the principal user flows.
- [ ] Identify the chosen web hosting provider and deployment method.
- [ ] Configure the production Supabase environment.
- [ ] Configure production authentication URLs and environment variables.
- [ ] Prepare and test the standalone Android release build.
- [ ] Configure iOS release requirements if iOS distribution is in scope.
- [ ] Run the production security checklist.
- [ ] Deploy to the agreed hosting environment.
- [ ] Perform live smoke tests and share the deployment details with the project owner.

### Items to Confirm with the Project Owner

Before production deployment, confirm:

1. Access to the Git repository and the required branches.
2. Access to the development and production Supabase projects.
3. The target web hosting provider and domain.
4. Whether the release includes Android only or Android, iOS, and web.
5. Access to Google Play Console and Apple Developer accounts, if applicable.
6. The intended production app name, application identifiers, and release branding.
7. Any existing SQL setup scripts, migrations, or deployment instructions not yet committed to the repository.

---

## Contributing

When making changes:

1. Review the existing implementation before replacing files or changing architecture.
2. Keep credentials and environment-specific configuration out of source control.
3. Test changes locally before deploying them.
4. Avoid unrelated dependency upgrades.
5. Document new environment variables, database changes, and deployment requirements.
6. Ensure database schema changes and required policies are included in version control where possible.
7. Never deploy untested database or authentication changes directly to production.

---

## License

Add the project's applicable license here before distributing the source code publicly. If the repository is private or proprietary, clarify the applicable ownership and usage terms with the project owner.
