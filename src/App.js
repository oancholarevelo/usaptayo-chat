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

    // Effect for handling auth and user profile state
    useEffect(() => {
        signInAnonymously(auth).catch(error => console.error("Anonymous sign-in failed:", error));

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const userRef = doc(db, 'users', currentUser.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const profile = userSnap.data();
                    setUserProfile(profile);
                    setAppState(profile.status || 'matchmaking');
                    if (profile.status === 'chatting' && profile.currentChatId) {
                        setChatId(profile.currentChatId);
                    }
                } else {
                    setAppState('homepage'); // Show homepage for new users
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
                setAppState(data.status);
                if (data.status === 'chatting') {
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
        
        if (window.confirm('Are you sure you want to reset and start over? This will clear your profile.')) {
            try {
                // Delete user profile from Firebase
                const userRef = doc(db, 'users', user.uid);
                await setDoc(userRef, {}, { merge: false }); // Clear the document
                
                // Reset local state
                setUserProfile(null);
                setAppState('homepage');
                setChatId(null);
            } catch (error) {
                console.error("Error resetting profile:", error);
                // Fallback to clearing localStorage and reloading
                localStorage.clear();
                window.location.reload();
            }
        }
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

            usersInChat.forEach(uid => {
                const userRef = doc(db, 'users', uid);
                batch.update(userRef, { status: 'matchmaking', currentChatId: null });
            });
            
            // Optional: delete the chat document and its messages
            batch.delete(chatRef);

            await batch.commit();
        }
        setChatId(null);
        setAppState('matchmaking');
    };

    switch (appState) {
        case 'loading':
            return <LoadingScreen text="Loading..." />;
        case 'homepage':
            return <Homepage onAccept={handleHomepageAccept} />;
        case 'nickname':
            return <NicknamePrompt onProfileCreate={handleProfileCreate} />;
        case 'matchmaking':
            return <MatchmakingScreen onFindChat={findChat} onReset={handleReset} />;
        case 'waiting':
            return <LoadingScreen text="Connecting to a stranger..." />;
        case 'chatting':
            return <ChatPage userProfile={userProfile} chatId={chatId} onEndChat={endChat} />;
        default:
            return <LoadingScreen text="An error occurred." />;
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
                <button onClick={onReset} style={{ 
                    backgroundColor: '#6b7280', 
                    marginTop: '1rem',
                    fontSize: '0.875rem'
                }}>
                    Reset Profile
                </button>
            </div>
        </div>
    );
};

const ChatPage = ({ userProfile, chatId, onEndChat }) => (
    <div className="chat-page">
        <Header onEndChat={onEndChat} />
        <ChatRoom userProfile={userProfile} chatId={chatId} />
        <MessageInput userProfile={userProfile} chatId={chatId} />
    </div>
);

const Header = ({ onEndChat }) => (
    <header className="header">
        <h1>UsapTayo</h1>
        <button onClick={onEndChat}>End Chat</button>
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
    const { text, uid, photoURL, displayName } = message;
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
                <svg fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10.894 2.553a1 1 0 00-1.789 0l-2 4A1 1 0 008 8h4a1 1 0 00.894-1.447l-2-4zM10 18a1 1 0 01-1-1v-6a1 1 0 112 0v6a1 1 0 01-1 1z"></path></svg>
            </button>
        </form>
    );
};