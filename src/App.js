import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, setDoc, limit, where, runTransaction, getDocs, writeBatch } from 'firebase/firestore';
import './App.css'; // Import the CSS file

// --- Firebase Configuration ---
// PASTE YOUR FIREBASE CONFIG OBJECT HERE
const firebaseConfig = {
  apiKey: "AIzaSyAA-AIF29Y0QB0A34rtA3MxOPRcAXzsuKQ",
  authDomain: "usaptayo-chat.firebaseapp.com",
  projectId: "usaptayo-chat",
  storageBucket: "usaptayo-chat.firebasestorage.app",
  messagingSenderId: "793461396179",
  appId: "1:793461396179:web:259b12c1aab3bb46d4fa26",
  measurementId: "G-H6X3PY5FVB"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [appState, setAppState] = useState('loading'); // loading, homepage, nickname, matchmaking, waiting, chatting
    const [chatId, setChatId] = useState(null);
    const [notification, setNotification] = useState({ show: false, message: '', type: 'info' }); // info, success, error
    const [confirmDialog, setConfirmDialog] = useState({ show: false, message: '', onConfirm: null });

    // Helper functions for notifications
    const showNotification = (message, type = 'info') => {
        setNotification({ show: true, message, type });
        setTimeout(() => setNotification({ show: false, message: '', type: 'info' }), 4000);
    };

    const showConfirmDialog = (message, onConfirm) => {
        setConfirmDialog({ show: true, message, onConfirm });
    };

    const hideConfirmDialog = () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
    };

    // Effect for handling auth and user profile state
    useEffect(() => {
        // Clear any existing data on fresh app load
        const sessionId = sessionStorage.getItem('usaptayo-session');
        if (!sessionId) {
            // New session - clear any cached data
            localStorage.removeItem('usaptayo-user');
            sessionStorage.setItem('usaptayo-session', Date.now().toString());
        }

        const initializeAuth = async () => {
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous sign-in failed:", error);
                setAppState('homepage'); // Fallback to homepage if auth fails
            }
        };

        initializeAuth();

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                try {
                    const userRef = doc(db, 'users', currentUser.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const profile = userSnap.data();
                        
                        // Check if this is a fresh session - if so, always start from homepage
                        const isNewSession = !sessionStorage.getItem('usaptayo-user-loaded');
                        if (isNewSession) {
                            sessionStorage.setItem('usaptayo-user-loaded', 'true');
                            // Clear the user profile and start fresh
                            await setDoc(userRef, {}, { merge: false });
                            setAppState('homepage');
                            return;
                        }
                        
                        setUserProfile(profile);
                        
                        // Ensure status is valid, default to 'homepage' if undefined/null
                        const validStatus = profile.status && ['homepage', 'nickname', 'matchmaking', 'waiting', 'chatting', 'chat_ended'].includes(profile.status) 
                            ? profile.status 
                            : 'homepage';
                        setAppState(validStatus);
                        
                        if ((profile.status === 'chatting' || profile.status === 'chat_ended') && profile.currentChatId) {
                            setChatId(profile.currentChatId);
                        }
                    } else {
                        setAppState('homepage'); // Show homepage for new users
                    }
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                    setAppState('homepage'); // Fallback to homepage if database error
                }
            } else {
                setUser(null);
                setUserProfile(null);
                setAppState('loading');
            }
        });

        return () => unsubscribe();
    }, []);

    // Effect for listening to user status changes (e.g., when a match is found)
    useEffect(() => {
        if (!user) return;
        const userRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setUserProfile(data);
                
                // Ensure status is valid, default to 'homepage' if undefined/null
                const validStatus = data.status && ['homepage', 'nickname', 'matchmaking', 'waiting', 'chatting', 'chat_ended'].includes(data.status) 
                    ? data.status 
                    : 'homepage';
                setAppState(validStatus);
                
                if (data.status === 'chatting' || data.status === 'chat_ended') {
                    setChatId(data.currentChatId);
                }
            }
        });
        return () => unsubscribe();
    }, [user]);

    const handleHomepageAccept = () => {
        setAppState('nickname');
    };

    const handleProfileCreate = async (nickname) => {
        if (!user) return;
        const newUserProfile = {
            uid: user.uid,
            displayName: nickname,
            photoURL: `https://placehold.co/100x100/8b5cf6/ffffff?text=${nickname.charAt(0).toUpperCase()}`,
            createdAt: serverTimestamp(),
            status: 'matchmaking', // Initial status
            currentChatId: null,
        };
        await setDoc(doc(db, 'users', user.uid), newUserProfile);
        setUserProfile(newUserProfile);
        setAppState('matchmaking');
    };

    const handleReset = async () => {
        if (!user) return;
        
        showConfirmDialog('Are you sure you want to reset and start over? This will clear your profile.', async () => {
            try {
                // Delete user profile from Firebase
                const userRef = doc(db, 'users', user.uid);
                await setDoc(userRef, {}, { merge: false }); // Clear the document
                
                // Reset local state
                setUserProfile(null);
                setAppState('homepage');
                setChatId(null);
                
                showNotification('Profile reset successfully!', 'success');
                hideConfirmDialog();
            } catch (error) {
                console.error("Error resetting profile:", error);
                showNotification('Failed to reset profile. Please try again.', 'error');
                hideConfirmDialog();
                
                // Still navigate to homepage even if reset fails
                setUserProfile(null);
                setAppState('homepage');
                setChatId(null);
            }
        });
    };

    const findChat = async () => {
        if (!user) return;
        setAppState('waiting');
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { status: 'waiting' }, { merge: true });

        try {
            await runTransaction(db, async (transaction) => {
                const waitingUsersQuery = query(
                    collection(db, 'users'),
                    where('status', '==', 'waiting'),
                    where('uid', '!=', user.uid),
                    limit(1)
                );
                const waitingUsersSnap = await getDocs(waitingUsersQuery);

                if (!waitingUsersSnap.empty) {
                    const partner = waitingUsersSnap.docs[0].data();
                    const partnerRef = doc(db, 'users', partner.uid);
                    
                    const newChatRef = doc(collection(db, 'chats'));
                    
                    transaction.set(newChatRef, {
                        users: [user.uid, partner.uid],
                        createdAt: serverTimestamp(),
                    });

                    transaction.update(userRef, { status: 'chatting', currentChatId: newChatRef.id });
                    transaction.update(partnerRef, { status: 'chatting', currentChatId: newChatRef.id });
                }
            });
        } catch (error) {
            console.error("Matchmaking transaction failed: ", error);
            await setDoc(userRef, { status: 'matchmaking' }, { merge: true });
            setAppState('matchmaking');
        }
    };

    const endChat = async () => {
        if (!user || !chatId) return;

        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
            const batch = writeBatch(db);
            const usersInChat = chatSnap.data().users;

            // Add a disconnection message to the chat
            const messagesRef = collection(db, 'chats', chatId, 'messages');
            await addDoc(messagesRef, {
                text: `${userProfile.displayName} has left the chat`,
                createdAt: serverTimestamp(),
                uid: 'system',
                photoURL: '',
                displayName: 'System',
                isSystemMessage: true
            });

            // Update chat status to ended
            batch.update(chatRef, { 
                status: 'ended',
                endedAt: serverTimestamp(),
                endedBy: user.uid
            });

            // Update user statuses - only the one who ended goes back to matchmaking
            usersInChat.forEach(uid => {
                const userRef = doc(db, 'users', uid);
                if (uid === user.uid) {
                    // User who ended the chat goes back to matchmaking
                    batch.update(userRef, { status: 'matchmaking', currentChatId: null });
                } else {
                    // Other user stays in chat but with ended status
                    batch.update(userRef, { status: 'chat_ended', currentChatId: chatId });
                }
            });

            await batch.commit();
        }
        setChatId(null);
        setAppState('matchmaking');
    };

    const leaveEndedChat = async () => {
        if (!user) return;
        
        // Clear the user's current chat and go back to matchmaking
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { status: 'matchmaking', currentChatId: null }, { merge: true });
        
        setChatId(null);
        setAppState('matchmaking');
    };

    // Effect for handling tab visibility and cleanup
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'hidden' && user && userProfile) {
                // Clean up when tab becomes hidden (works better on mobile)
                try {
                    const userRef = doc(db, 'users', user.uid);
                    await setDoc(userRef, {}, { merge: false });
                } catch (error) {
                    console.error("Error cleaning up on visibility change:", error);
                }
            }
        };

        const handleBeforeUnload = async (event) => {
            if (user && userProfile) {
                // Try to clean up user profile when tab is closed
                try {
                    const userRef = doc(db, 'users', user.uid);
                    await setDoc(userRef, {}, { merge: false });
                } catch (error) {
                    console.error("Error cleaning up on tab close:", error);
                }
            }
        };

        // Add multiple event listeners for better mobile support
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', handleBeforeUnload);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('pagehide', handleBeforeUnload);
        };
    }, [user, userProfile]);

    switch (appState) {
        case 'loading':
            return (
                <>
                    <LoadingScreen text="Loading..." />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        case 'homepage':
            return (
                <>
                    <Homepage onAccept={handleHomepageAccept} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        case 'nickname':
            return (
                <>
                    <NicknamePrompt onProfileCreate={handleProfileCreate} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        case 'matchmaking':
            return (
                <>
                    <MatchmakingScreen onFindChat={findChat} onReset={handleReset} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        case 'waiting':
            return (
                <>
                    <LoadingScreen text="Connecting to a stranger..." />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        case 'chatting':
            return (
                <>
                    <ChatPage userProfile={userProfile} chatId={chatId} onEndChat={endChat} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        case 'chat_ended':
            return (
                <>
                    <ChatPage userProfile={userProfile} chatId={chatId} onEndChat={leaveEndedChat} chatEnded={true} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
        default:
            return (
                <>
                    <div className="centered-screen">
                        <div className="prompt-box">
                            <h1>UsapTayo</h1>
                            <p>Something went wrong. Current state: {appState}</p>
                            <button onClick={() => setAppState('homepage')}>Go to Homepage</button>
                        </div>
                    </div>
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                </>
            );
    }
}

// --- UI Components ---

const Homepage = ({ onAccept }) => {
    const [isOver18, setIsOver18] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isOver18 && agreeTerms) {
            onAccept();
        }
    };

    return (
        <div className="homepage">
            <div className="homepage-content">
                <h1>Welcome to UsapTayo</h1>
                <p>
                    UsapTayo is an anonymous chat platform where you can connect with strangers and have 
                    meaningful conversations. Whether you want to share your thoughts, seek advice, or 
                    simply chat with someone new, UsapTayo provides a safe and friendly environment for 
                    open communication. Start conversations, make connections, and discover new perspectives 
                    from people around the world.
                </p>

                <h2>Community Guidelines</h2>
                <p>To ensure a positive experience for everyone, please follow these guidelines:</p>
                <ul>
                    <li>You must be at least 18 years old to use this platform.</li>
                    <li>Be respectful and kind to other users at all times.</li>
                    <li>Do not share personal information such as your real name, address, phone number, or social media accounts.</li>
                    <li>Avoid sending inappropriate, offensive, or harmful messages.</li>
                    <li>Do not spam, advertise, or promote external services.</li>
                    <li>Report any inappropriate behavior using our reporting system.</li>
                </ul>

                <h2>Privacy & Safety</h2>
                <p>
                    Your privacy and safety are our top priorities. All chats are anonymous and temporary. 
                    We do not store your personal information or chat history permanently. Remember to never 
                    share sensitive personal details with strangers online.
                </p>
                <p>
                    By using UsapTayo, you acknowledge that you understand the risks of online communication 
                    and agree to use the platform responsibly. We are not responsible for any interactions 
                    or content shared between users.
                </p>

                <form onSubmit={handleSubmit} className="homepage-form">
                    <div className="checkbox-container">
                        <label>
                            <input 
                                type="checkbox" 
                                checked={isOver18} 
                                onChange={(e) => setIsOver18(e.target.checked)} 
                            />
                            I confirm that I am 18 years old or older.
                        </label>
                    </div>
                    <div className="checkbox-container">
                        <label>
                            <input 
                                type="checkbox" 
                                checked={agreeTerms} 
                                onChange={(e) => setAgreeTerms(e.target.checked)} 
                            />
                            I agree to follow the community guidelines and use UsapTayo responsibly.
                        </label>
                    </div>
                    <button type="submit" disabled={!isOver18 || !agreeTerms}>
                        Start Chatting
                    </button>
                </form>
            </div>
        </div>
    );
};

const LoadingScreen = ({ text }) => (
    <div className="centered-screen loading-animation">
        <div className="prompt-box">
            <h1>UsapTayo</h1>
            <p>{text}</p>
        </div>
    </div>
);

const NicknamePrompt = ({ onProfileCreate }) => {
    const [nickname, setNickname] = useState('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (nickname.trim().length > 2) onProfileCreate(nickname.trim());
    };
    return (
        <div className="centered-screen">
            <div className="prompt-box">
                <h1>UsapTayo</h1>
                <p>Choose a nickname to start chatting.</p>
                <form onSubmit={handleSubmit}>
                    <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Enter your nickname" />
                    <button type="submit" disabled={nickname.trim().length <= 2}>Let's Go!</button>
                </form>
            </div>
        </div>
    );
};

const MatchmakingScreen = ({ onFindChat, onReset }) => {
    return (
        <div className="centered-screen">
            <div className="prompt-box">
                <h1>UsapTayo</h1>
                <p>Ready to meet someone new?</p>
                <button onClick={onFindChat}>Find a Stranger</button>
                <button onClick={onReset} className="reset-profile-button">
                    Reset Profile
                </button>
            </div>
        </div>
    );
};

const ChatPage = ({ userProfile, chatId, onEndChat, chatEnded }) => (
    <div className="chat-page">
        <Header onEndChat={onEndChat} chatEnded={chatEnded} />
        <ChatRoom userProfile={userProfile} chatId={chatId} />
        {!chatEnded && <MessageInput userProfile={userProfile} chatId={chatId} />}
        {chatEnded && <DisconnectedNotice />}
    </div>
);

const Header = ({ onEndChat, chatEnded }) => (
    <header className="header">
        <h1>UsapTayo</h1>
        <button onClick={onEndChat}>
            {chatEnded ? 'Leave Chat' : 'End Chat'}
        </button>
    </header>
);

const ChatRoom = ({ userProfile, chatId }) => {
    const [messages, setMessages] = useState([]);
    const dummy = useRef();

    useEffect(() => {
        if (!chatId) return;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
        });
        return unsubscribe;
    }, [chatId]);

    useEffect(() => {
        dummy.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <main className="chat-room">
            {messages.map(msg => <ChatMessage key={msg.id} message={msg} currentUserUID={userProfile.uid} />)}
            <div ref={dummy} className="dummy-div"></div>
        </main>
    );
};

const ChatMessage = ({ message, currentUserUID }) => {
    const { text, uid, photoURL, displayName, isSystemMessage } = message;
    
    // Handle system messages differently
    if (isSystemMessage) {
        return (
            <div className="system-message">
                <p>{text}</p>
            </div>
        );
    }
    
    const messageClass = uid === currentUserUID ? 'sent' : 'received';
    return (
        <div className={`message-container ${messageClass}`}>
            <div className="message-inner">
                <img src={photoURL || `https://placehold.co/40x40/8b5cf6/ffffff?text=${displayName?.[0] || 'U'}`} alt="User Avatar" />
                <div className={`message-bubble ${messageClass}`}>
                    <p className="display-name">{displayName || 'Anonymous'}</p>
                    <p>{text}</p>
                </div>
            </div>
        </div>
    );
};

const MessageInput = ({ userProfile, chatId }) => {
    const [formValue, setFormValue] = useState('');
    const sendMessage = async (e) => {
        e.preventDefault();
        if (!formValue.trim() || !chatId) return;
        const { uid, photoURL, displayName } = userProfile;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await addDoc(messagesRef, {
            text: formValue,
            createdAt: serverTimestamp(),
            uid,
            photoURL,
            displayName
        });
        setFormValue('');
    };
    return (
        <form onSubmit={sendMessage} className="message-form">
            <input value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="Start a conversation..." />
            <button type="submit" disabled={!formValue.trim()}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
                </svg>
            </button>
        </form>
    );
};

// Notification Toast Component
const NotificationToast = ({ message, type }) => (
    <div className={`notification-toast ${type}`}>
        <div className="notification-content">
            <span className="notification-icon">
                {type === 'success' && '✓'}
                {type === 'error' && '✕'}
                {type === 'info' && 'ℹ'}
            </span>
            <span className="notification-message">{message}</span>
        </div>
    </div>
);

// Confirmation Dialog Component
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
    <div className="confirm-dialog-overlay">
        <div className="confirm-dialog">
            <div className="confirm-dialog-content">
                <h3>Confirm Action</h3>
                <p>{message}</p>
                <div className="confirm-dialog-buttons">
                    <button onClick={onCancel} className="cancel-button">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="confirm-button">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    </div>
);

// Disconnected Notice Component
const DisconnectedNotice = () => (
    <div className="disconnected-notice">
        <p>The other user has left the chat. You can still read your conversation history above.</p>
    </div>
);