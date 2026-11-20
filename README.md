# Offline Contact Manager (Android)

An offline-first Android contact manager built with React Native and Expo.

## Offline operation

Contacts and groups are stored in a local SQLite database on the Android device. Creating, viewing, editing, deleting, searching, filtering, favoriting, and grouping contacts work without an internet connection.

There is no cloud account, remote database, or contact synchronization service. JSON backups are exported and imported only when the user initiates those actions. Export a backup regularly: uninstalling the app or clearing its app data may erase the local database.

Call, SMS, and email shortcuts open Android apps and may require cellular service, Wi-Fi, or an email account. These shortcuts are optional; contact management itself works offline.

## Features

- Add, view, edit, and delete contacts
- Contact groups (create, edit, delete, and assign contacts)
- Search by name, phone, or email
- Favorites and alphabetical/recent sorting
- Contact details with call, SMS, and email shortcuts
- JSON backup export and restore
- Persistent local SQLite storage

## Requirements

- Node.js LTS
- npm
- Expo Go for development, or an installable Android APK for standalone use

## Run locally

```bash
npm install
npx expo install --fix
npx expo install expo-font
npx expo-doctor
npx expo start --clear
```

Scan the QR code with Expo Go. The development server is needed for this workflow; use the standalone APK for normal offline use.

## Build an Android APK

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

Install the generated APK on your Android phone. The EAS cloud build and APK download require internet access, but local contact management does not.

## Data and privacy

This project stores contact records locally in SQLite and does not upload them to a server. Back up your contacts before uninstalling the app or clearing its storage.
