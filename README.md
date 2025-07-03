# UsapTayo - Anonymous Chat Application

**UsapTayo** is a real-time, anonymous one-on-one chat application built with React and Firebase. It allows users to connect with random strangers for spontaneous and temporary conversations. The platform is designed for privacy and simplicity, requiring no user registration—just a nickname to get started.

## Features

- **Anonymous Chatting**: Users can chat without creating an account or providing personal information.
- **Random Matchmaking**: Connects users with a random stranger who is also looking for a conversation.
- **One-on-One Chat Rooms**: All conversations are private between two users.
- **Real-Time Messaging**: Powered by Firebase Firestore for instant message delivery.
- **State Management**: A robust state machine handles the user's journey from the homepage to matchmaking, waiting, and chatting.
- **System Notifications**: In-app notifications for events like profile resets or errors.
- **Graceful Disconnection**: Handles cases where one user leaves the chat, informing the other user.
- **Session Management**: Ensures a clean state and proper cleanup when a user closes the tab or their session ends.
- **Vercel Analytics**: Integrated for monitoring application usage and performance.

## Tech Stack

- **Frontend**: React.js
- **Backend & Database**: Firebase
  - **Authentication**: Firebase Anonymous Authentication
  - **Database**: Cloud Firestore for real-time messaging and user status management.
  - **Serverless Functions**: Firebase Transactions for atomic matchmaking operations.
- **Deployment & Analytics**: Vercel

## How It Works

1.  **Homepage & Guidelines**: New users are greeted with community guidelines and must confirm they are 18+ to proceed.
2.  **Anonymous Sign-In**: Upon starting, the app uses Firebase to sign the user in anonymously, creating a temporary user ID.
3.  **Nickname Creation**: The user chooses a nickname, which is stored in Firestore along with their anonymous UID and a generated avatar.
4.  **Matchmaking**: The user enters a "waiting" queue. The system uses a Firebase Transaction to atomically find another user in the queue and pair them up.
5.  **Chat Room Creation**: Once a match is found, a new private chat document is created in Firestore. Both users' statuses are updated to "chatting," and they are redirected to the chat room.
6.  **Chatting**: Messages are sent and received in real-time within the private chat room.
7.  **Ending a Chat**: Either user can end the chat. This updates the chat status and resets both users' statuses back to "matchmaking," allowing them to find new partners.

## Project Setup

To run this project locally, follow these steps:

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd usaptayo-chat
````

### 2\. Install dependencies

```bash
npm install
```

### 3\. Set up Firebase

  - Create a new project in the [Firebase Console](https://console.firebase.google.com/).
  - Register a new web app and copy the `firebaseConfig` object.
  - Enable **Anonymous Authentication** in the Authentication \> Sign-in method tab.
  - Set up a **Cloud Firestore** database and start it in **Test Mode** for local development.

### 4\. Configure Environment Variables

Create a `.env` file in the root of your project and add your Firebase project credentials.

```
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 5\. Run the application

```bash
npm start
```

The application will be available at `http://localhost:3000`.