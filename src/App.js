import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDoc, setDoc, limit, where, runTransaction, getDocs, writeBatch } from 'firebase/firestore';
import { Analytics } from "@vercel/analytics/react";
import './App.css'; // Import the CSS file

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
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
    const [theme, setTheme] = useState(() => {
        // Get theme from localStorage or default to 'dark'
        return localStorage.getItem('usaptayo-theme') || 'dark';
    });

    // Theme toggle function
    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('usaptayo-theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    // Set theme on component mount
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

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
            // Use a transaction to ensure atomic matchmaking
            const result = await runTransaction(db, async (transaction) => {
                // Query for waiting users
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
                    
                    // Double-check that the partner is still waiting
                    const partnerDoc = await transaction.get(partnerRef);
                    if (!partnerDoc.exists() || partnerDoc.data().status !== 'waiting') {
                        throw new Error('Partner no longer waiting');
                    }
                    
                    // Create new chat
                    const newChatRef = doc(collection(db, 'chats'));
                    transaction.set(newChatRef, {
                        users: [user.uid, partner.uid],
                        createdAt: serverTimestamp(),
                    });

                    // Update both users to chatting status atomically
                    transaction.update(userRef, { status: 'chatting', currentChatId: newChatRef.id });
                    transaction.update(partnerRef, { status: 'chatting', currentChatId: newChatRef.id });
                    
                    return { chatId: newChatRef.id, partner: partner };
                } else {
                    // No waiting users found, stay in waiting state
                    return null;
                }
            });

            // If we successfully matched, add the connection message
            if (result) {
                const messagesRef = collection(db, 'chats', result.chatId, 'messages');
                
                // Add personalized connection messages for each user
                await addDoc(messagesRef, {
                    text: `You connected with ${result.partner.displayName}`,
                    createdAt: serverTimestamp(),
                    uid: 'system',
                    photoURL: '',
                    displayName: 'System',
                    isSystemMessage: true,
                    visibleTo: user.uid // Only visible to the current user
                });
                
                await addDoc(messagesRef, {
                    text: `You connected with ${userProfile.displayName}`,
                    createdAt: serverTimestamp(),
                    uid: 'system',
                    photoURL: '',
                    displayName: 'System',
                    isSystemMessage: true,
                    visibleTo: result.partner.uid // Only visible to the partner
                });
            }

            // The onSnapshot listener will handle the state transition
        } catch (error) {
            console.error("Matchmaking failed: ", error);
            // If transaction fails, try again after a short delay
            setTimeout(async () => {
                try {
                    await setDoc(userRef, { status: 'waiting' }, { merge: true });
                } catch (retryError) {
                    console.error("Retry failed:", retryError);
                    await setDoc(userRef, { status: 'matchmaking' }, { merge: true });
                    setAppState('matchmaking');
                }
            }, 1000);
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

    // Effect to handle cleanup when user disconnects while waiting
    useEffect(() => {
        let cleanupTimer;
        
        if (appState === 'waiting' && user) {
            // Set a timeout to clean up if user stays in waiting too long
            cleanupTimer = setTimeout(async () => {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    await setDoc(userRef, { status: 'matchmaking' }, { merge: true });
                    setAppState('matchmaking');
                } catch (error) {
                    console.error("Cleanup failed:", error);
                }
            }, 30000); // 30 seconds timeout
        }
        
        return () => {
            if (cleanupTimer) {
                clearTimeout(cleanupTimer);
            }
        };
    }, [appState, user]);

    switch (appState) {
        case 'loading':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <LoadingScreen text="Loading..." />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        case 'homepage':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <Homepage onAccept={handleHomepageAccept} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        case 'nickname':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <NicknamePrompt onProfileCreate={handleProfileCreate} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        case 'matchmaking':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <MatchmakingScreen onFindChat={findChat} onReset={handleReset} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        case 'waiting':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <LoadingScreen text="Connecting to a stranger..." />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        case 'chatting':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <ChatPage userProfile={userProfile} chatId={chatId} onEndChat={endChat} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        case 'chat_ended':
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <ChatPage userProfile={userProfile} chatId={chatId} onEndChat={leaveEndedChat} onNextStranger={findChat} onBackHome={() => setAppState('matchmaking')} chatEnded={true} />
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
                </>
            );
        default:
            return (
                <>
                    <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
                    <div className="centered-screen">
                        <div className="prompt-box">
                            <h1>UsapTayo</h1>
                            <p>Something went wrong. Current state: {appState}</p>
                            <button onClick={() => setAppState('homepage')}>Go to Homepage</button>
                        </div>
                    </div>
                    {notification.show && <NotificationToast message={notification.message} type={notification.type} />}
                    {confirmDialog.show && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={hideConfirmDialog} />}
                    <Analytics />
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
                <p>Ready ka na ba maging backburner?</p>
                <button onClick={onFindChat}>Find a Stranger</button>
                <button onClick={onReset} className="reset-profile-button">
                    Reset Profile
                </button>
            </div>
        </div>
    );
};

const ChatPage = ({ userProfile, chatId, onEndChat, onNextStranger, onBackHome, chatEnded }) => (
    <div className="chat-page">
        <Header chatEnded={chatEnded} />
        <ChatRoom userProfile={userProfile} chatId={chatId} />
        {!chatEnded && <MessageInput userProfile={userProfile} chatId={chatId} onEndChat={onEndChat} />}
        {chatEnded && <ChatEndedActions onNextStranger={onNextStranger} onBackHome={onBackHome} />}
    </div>
);

const Header = ({ chatEnded }) => (
    <header className="header">
        <h1>UsapTayo</h1>
    </header>
);

const ChatRoom = ({ userProfile, chatId }) => {
    const [messages, setMessages] = useState([]);
    const dummy = useRef();
    const chatRoomRef = useRef();

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
        // More aggressive scroll to bottom for mobile devices
        const scrollToBottom = () => {
            if (dummy.current && chatRoomRef.current) {
                // Try multiple scroll methods for better mobile compatibility
                dummy.current.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'end'
                });
                
                // Fallback: scroll the chat room container to bottom
                setTimeout(() => {
                    if (chatRoomRef.current) {
                        chatRoomRef.current.scrollTop = chatRoomRef.current.scrollHeight;
                    }
                }, 150);
            }
        };
        
        // Use multiple timeouts to ensure scrolling works on mobile
        const timeoutId1 = setTimeout(scrollToBottom, 100);
        const timeoutId2 = setTimeout(scrollToBottom, 300); // Second attempt for mobile
        
        return () => {
            clearTimeout(timeoutId1);
            clearTimeout(timeoutId2);
        };
    }, [messages]);

    return (
        <main className="chat-room" ref={chatRoomRef}>
            {messages.map(msg => <ChatMessage key={msg.id} message={msg} currentUserUID={userProfile.uid} />)}
            <div ref={dummy} className="dummy-div"></div>
        </main>
    );
};

const ChatMessage = ({ message, currentUserUID }) => {
    const { text, uid, photoURL, displayName, isSystemMessage, visibleTo } = message;
    
    // Handle system messages differently
    if (isSystemMessage) {
        // If message has visibleTo field and it's not for current user, don't render
        if (visibleTo && visibleTo !== currentUserUID) {
            return null;
        }
        
        let systemMessageClass = 'system-message';
        
        // Add specific classes for different types of system messages
        if (text.includes('connected with')) {
            systemMessageClass += ' connection';
        } else if (text.includes('has left the chat')) {
            systemMessageClass += ' disconnection';
        }
        
        return (
            <div className={systemMessageClass}>
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

const MessageInput = ({ userProfile, chatId, onEndChat }) => {
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
            <button type="button" onClick={onEndChat} className="end-chat-button" title="End Chat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
            </button>
            <input value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="Start a conversation..." />
            <button type="submit" disabled={!formValue.trim()} className="send-button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

// Theme Toggle Component
const ThemeToggle = ({ theme, toggleTheme }) => (
    <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 6.34L4.93 4.93M19.07 19.07l-1.41-1.41"/>
            </svg>
        ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
        )}
    </button>
);

// Chat Ended Actions Component
const ChatEndedActions = ({ onNextStranger, onBackHome }) => (
    <div className="chat-ended-actions">
        <button onClick={onNextStranger} className="next-stranger-button">
            Next Stranger
        </button>
        <button onClick={onBackHome} className="back-home-button">
            Back to Home
        </button>
    </div>
);