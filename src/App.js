import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  limit,
  where,
  runTransaction,
  getDocs,
  writeBatch,
  updateDoc,
} from "firebase/firestore";
import { Analytics } from "@vercel/analytics/react";
import "./App.css"; // Import the CSS file

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [appState, setAppState] = useState("loading"); // loading, homepage, nickname, matchmaking, waiting, chatting, admin
  const [chatId, setChatId] = useState(null);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "info",
  }); // info, success, error
  const [confirmDialog, setConfirmDialog] = useState({
    show: false,
    message: "",
    onConfirm: null,
  });
  const [announcementModal, setAnnouncementModal] = useState({ show: false });
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState(() => {
    // Get theme from localStorage or default to 'dark'
    return localStorage.getItem("usaptayo-theme") || "dark";
  });

  // Admin access function - triggered by secret keyboard shortcut
  const checkAdminAccess = () => {
    const adminPassword = prompt("Enter admin password:");
    // Secure admin password
    if (adminPassword === "TP9K9p!g4Fq$M-F") {
      setIsAdmin(true);
      setAppState("admin");
      showNotification("Admin access granted! ✨", "success");
    } else {
      showNotification("Invalid admin password!", "error");
    }
  };

  // Secret access methods for admin (works on both desktop and mobile)
  const [tapCount, setTapCount] = useState(0);
  const [tapTimer, setTapTimer] = useState(null);

  const handleSecretTap = () => {
    if (tapTimer) clearTimeout(tapTimer);

    const newCount = tapCount + 1;
    setTapCount(newCount);

    if (newCount >= 7) {
      // 7 taps triggers admin access
      setTapCount(0);
      checkAdminAccess();
      return;
    }

    // Reset counter after 3 seconds of no taps
    const timer = setTimeout(() => {
      setTapCount(0);
    }, 3000);
    setTapTimer(timer);
  };

  // Desktop keyboard shortcut (Ctrl+Shift+A)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        checkAdminAccess();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup tap timer on unmount
  useEffect(() => {
    return () => {
      if (tapTimer) clearTimeout(tapTimer);
    };
  }, [tapTimer]);

  // Function to approve announcement
  const approveAnnouncement = async (requestId, requestData) => {
    try {
      const batch = writeBatch(db);

      // Create the active announcement
      const announcementRef = doc(collection(db, "announcements"));
      const expirationTime = new Date();
      expirationTime.setMinutes(
        expirationTime.getMinutes() + requestData.duration
      );

      batch.set(announcementRef, {
        message: requestData.message,
        createdAt: serverTimestamp(),
        expiresAt: expirationTime,
        approvedBy: user.uid,
        originalRequestId: requestId,
      });

      // Update the request status
      const requestRef = doc(db, "announcement_requests", requestId);
      batch.update(requestRef, {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: user.uid,
      });

      await batch.commit();
      showNotification("Announcement approved and published! 📢", "success");
    } catch (error) {
      console.error("Error approving announcement:", error);
      showNotification("Failed to approve announcement!", "error");
    }
  };

  // Function to reject announcement
  const rejectAnnouncement = async (requestId, reason) => {
    try {
      const requestRef = doc(db, "announcement_requests", requestId);
      await updateDoc(requestRef, {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        rejectedBy: user.uid,
        rejectionReason: reason,
      });

      showNotification("Announcement rejected!", "success");
    } catch (error) {
      console.error("Error rejecting announcement:", error);
      showNotification("Failed to reject announcement!", "error");
    }
  };

  // Theme toggle function
  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("usaptayo-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  // Set theme on component mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Helper functions for notifications
  const showNotification = (message, type = "info") => {
    setNotification({ show: true, message, type });
    setTimeout(
      () => setNotification({ show: false, message: "", type: "info" }),
      4000
    );
  };

  const showConfirmDialog = (message, onConfirm) => {
    setConfirmDialog({ show: true, message, onConfirm });
  };

  const hideConfirmDialog = () => {
    setConfirmDialog({ show: false, message: "", onConfirm: null });
  };

  const showAnnouncementModal = () => {
    setAnnouncementModal({ show: true });
  };

  const hideAnnouncementModal = () => {
    setAnnouncementModal({ show: false });
  };

  // Check for active announcements on app load - IMPROVED EXPIRATION HANDLING
  useEffect(() => {
    const checkActiveAnnouncement = async () => {
      try {
        const announcementsRef = collection(db, "announcements");
        const q = query(
          announcementsRef,
          where("expiresAt", ">", new Date()),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
          if (!querySnapshot.empty) {
            const announcement = querySnapshot.docs[0].data();
            const announcementId = querySnapshot.docs[0].id;

            // Real-time expiration check
            const now = new Date();
            const expiresAt = announcement.expiresAt.toDate();

            if (expiresAt <= now) {
              // Immediately remove expired announcement from UI
              setActiveAnnouncement(null);

              // Mark as expired in database
              try {
                await updateDoc(doc(db, "announcements", announcementId), {
                  status: "expired",
                  expiredAt: serverTimestamp(),
                });
              } catch (error) {
                console.error("Error marking announcement as expired:", error);
              }
            } else {
              // Set up real-time expiration timer
              const timeUntilExpiry = expiresAt - now;
              setTimeout(() => {
                setActiveAnnouncement(null);
              }, timeUntilExpiry);

              setActiveAnnouncement({
                ...announcement,
                id: announcementId,
              });
            }
          } else {
            setActiveAnnouncement(null);
          }
        });
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching announcements:", error);
      }
    };

    checkActiveAnnouncement();
  }, []);

  // Effect for handling auth and user profile state
  useEffect(() => {
  // More aggressive session management - ALWAYS start fresh on reload/new visit
  const startFresh = () => {
    localStorage.removeItem("usaptayo-user");
    localStorage.removeItem("usaptayo-last-session");
    sessionStorage.clear();
    
    // Set new session flag
    sessionStorage.setItem("usaptayo-session", Date.now().toString());
    sessionStorage.setItem("usaptayo-fresh-start", "true");
    
    // Force homepage state directly
    setUserProfile(null);
    setAppState("homepage");
    setChatId(null);
  };
  
  // Always start fresh on each page load
  startFresh();

  const initializeAuth = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Anonymous sign-in failed:", error);
      setAppState("homepage");
    }
  };

  initializeAuth();

  const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    if (currentUser) {
      setUser(currentUser);
      
      try {
        // Always clear existing user profile in database on new visit
        const userRef = doc(db, "users", currentUser.uid);
        await setDoc(userRef, {}, { merge: false });
        
        console.log("User profile cleared for fresh start");
        setUserProfile(null);
        setAppState("homepage");
        setChatId(null);
      } catch (error) {
        console.error("Error handling user profile:", error);
        setAppState("homepage");
      }
    } else {
      setUser(null);
      setUserProfile(null);
      setAppState("loading");
    }
  });

  return () => unsubscribe();
}, []);

// Effect for listening to user status changes - fix the undefined status issue
useEffect(() => {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const unsubscribe = onSnapshot(
    userRef,
    (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        console.log(
          "User status update:",
          data.status,
          "for user:",
          user.uid
        );

        // Only update user profile if it has valid data
        if (data && Object.keys(data).length > 0) {
          setUserProfile(data);

          // Only process status changes if status is defined and valid
          if (data.status) {
            const validStatuses = [
              "homepage",
              "nickname",
              "matchmaking",
              "waiting",
              "chatting",
              "chat_ended",
            ];
            
            const newStatus = validStatuses.includes(data.status)
              ? data.status
              : "homepage"; // Default to homepage for invalid/undefined status
            
            // Only update app state if it's actually different
            if (newStatus !== appState) {
              console.log("Changing app state from", appState, "to", newStatus);
              setAppState(newStatus);
            }

            // Handle chat ID updates
            if (
              (data.status === "chatting" || data.status === "chat_ended") &&
              data.currentChatId
            ) {
              if (chatId !== data.currentChatId) {
                console.log("Setting chat ID to:", data.currentChatId);
                setChatId(data.currentChatId);
              }
            } else if (data.status === "matchmaking" && chatId) {
              // Clear chat ID when going back to matchmaking
              setChatId(null);
            }
          } else {
            // If status is undefined, set to homepage
            console.log("User has undefined status, defaulting to homepage");
            setAppState("homepage");
          }
        } else {
          // Empty profile should default to homepage
          console.log("Empty user profile, defaulting to homepage");
          setAppState("homepage");
        }
      } else {
        // Document doesn't exist, default to homepage
        console.log("User document doesn't exist, defaulting to homepage");
        setAppState("homepage");
      }
    },
    (error) => {
      console.error("User status listener error:", error);
      // On error, default to homepage
      setAppState("homepage");
    }
  );

  return () => unsubscribe();
}, [user, appState, chatId]);

  const handleHomepageAccept = async () => {
  if (user) {
    // Update user document in Firestore first
    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { status: "nickname" }, { merge: true });
      console.log("User status updated to nickname in Firestore");
      
      // Then update local state
      setAppState("nickname");
    } catch (error) {
      console.error("Error updating user status:", error);
      // Still update local state even if Firestore update fails
      setAppState("nickname");
    }
  } else {
    // If no user yet, just update local state
    setAppState("nickname");
  }
};

  const handleProfileCreate = async (nickname) => {
    if (!user) return;
    const newUserProfile = {
      uid: user.uid,
      displayName: nickname,
      photoURL: `https://placehold.co/100x100/8b5cf6/ffffff?text=${nickname
        .charAt(0)
        .toUpperCase()}`,
      createdAt: serverTimestamp(),
      status: "matchmaking", // Initial status
      currentChatId: null,
    };
    await setDoc(doc(db, "users", user.uid), newUserProfile);
    setUserProfile(newUserProfile);
    setAppState("matchmaking");
  };

  const handleReset = async () => {
    if (!user) return;

    showConfirmDialog(
      "Are you sure you want to reset and start over? This will clear your profile.",
      async () => {
        try {
          // Delete user profile from Firebase
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {}, { merge: false }); // Clear the document

          // Reset local state
          setUserProfile(null);
          setAppState("homepage");
          setChatId(null);

          showNotification("Profile reset successfully!", "success");
          hideConfirmDialog();
        } catch (error) {
          console.error("Error resetting profile:", error);
          showNotification(
            "Failed to reset profile. Please try again.",
            "error"
          );
          hideConfirmDialog();

          // Still navigate to homepage even if reset fails
          setUserProfile(null);
          setAppState("homepage");
          setChatId(null);
        }
      }
    );
  };

  // Add this at the top of your App component
  useEffect(() => {
    // Force a complete reset on each page load by setting a page load timestamp
    const currentLoadTime = Date.now();
    const lastLoadTime = parseInt(localStorage.getItem("usaptayo-page-loaded") || "0");
    
    // If returning within 3 seconds, it's likely a refresh/navigation
    // If more than 3 seconds, it's likely a new visit
    if (currentLoadTime - lastLoadTime > 3000) {
      console.log("New page visit detected - resetting to homepage");
      localStorage.setItem("usaptayo-force-homepage", "true");
    }
    
    localStorage.setItem("usaptayo-page-loaded", currentLoadTime.toString());
    
    // Check if we need to force homepage
    const forceHomepage = localStorage.getItem("usaptayo-force-homepage");
    if (forceHomepage) {
      localStorage.removeItem("usaptayo-force-homepage");
      setAppState("homepage");
    }
  }, []);

  const findChat = async () => {
    if (!user) return;

    console.log("Starting matchmaking for user:", user.uid);
    setAppState("waiting");

    const userRef = doc(db, "users", user.uid);
    await setDoc(
      userRef,
      {
        status: "waiting",
        waitingStarted: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      // Improved transaction with better error handling and retry logic
      const result = await runTransaction(db, async (transaction) => {
        // Query for waiting users excluding current user
        const waitingUsersQuery = query(
          collection(db, "users"),
          where("status", "==", "waiting"),
          where("uid", "!=", user.uid)
        );

        const waitingUsersSnap = await getDocs(waitingUsersQuery);
        console.log("Found waiting users:", waitingUsersSnap.size);

        if (!waitingUsersSnap.empty) {
          // Get the first available partner
          let partner = null;
          let partnerRef = null;

          // Try each waiting user until we find one that's still available
          for (const doc of waitingUsersSnap.docs) {
            const potentialPartner = doc.data();
            const potentialPartnerRef = doc.ref;

            // Double-check partner status in transaction
            const partnerDoc = await transaction.get(potentialPartnerRef);

            if (partnerDoc.exists() && partnerDoc.data().status === "waiting") {
              partner = potentialPartner;
              partnerRef = potentialPartnerRef;
              console.log("Found available partner:", partner.uid);
              break;
            } else {
              console.log("Partner no longer available:", potentialPartner.uid);
            }
          }

          if (partner && partnerRef) {
            // Create new chat with unique ID
            const newChatRef = doc(collection(db, "chats"));
            const chatData = {
              users: [user.uid, partner.uid],
              createdAt: serverTimestamp(),
              status: "active",
            };

            console.log(
              "Creating chat:",
              newChatRef.id,
              "between",
              user.uid,
              "and",
              partner.uid
            );
            transaction.set(newChatRef, chatData);

            // Update both users atomically
            transaction.update(userRef, {
              status: "chatting",
              currentChatId: newChatRef.id,
              matchedAt: serverTimestamp(),
              matchedWith: partner.uid,
            });

            transaction.update(partnerRef, {
              status: "chatting",
              currentChatId: newChatRef.id,
              matchedAt: serverTimestamp(),
              matchedWith: user.uid,
            });

            return { chatId: newChatRef.id, partner: partner };
          } else {
            console.log("No available partners found");
            return null;
          }
        } else {
          console.log("No waiting users found");
          return null;
        }
      });

      // Handle successful match
      if (result) {
        console.log("Match successful, adding connection messages");
        const messagesRef = collection(db, "chats", result.chatId, "messages");

        // Add connection messages for both users
        const messagePromises = [
          addDoc(messagesRef, {
            text: `You connected with ${result.partner.displayName}`,
            createdAt: serverTimestamp(),
            uid: "system",
            photoURL: "",
            displayName: "System",
            isSystemMessage: true,
            visibleTo: user.uid,
          }),
          addDoc(messagesRef, {
            text: `You connected with ${userProfile.displayName}`,
            createdAt: serverTimestamp(),
            uid: "system",
            photoURL: "",
            displayName: "System",
            isSystemMessage: true,
            visibleTo: result.partner.uid,
          }),
        ];

        await Promise.all(messagePromises);
        console.log("Connection messages added successfully");
      } else {
        // No match found, stay in waiting state
        console.log("No match found, staying in waiting state");
      }
    } catch (error) {
      console.error("Matchmaking transaction failed:", error);

      // More robust error handling with exponential backoff
      const retryDelay = Math.min(1000 * Math.pow(2, Math.random()), 5000);

      setTimeout(async () => {
        try {
          // Check current user status before retry
          const currentUserDoc = await getDoc(userRef);
          if (
            currentUserDoc.exists() &&
            currentUserDoc.data().status === "waiting"
          ) {
            console.log("Retrying matchmaking after error");
            // Reset to waiting state and try again
            await setDoc(
              userRef,
              {
                status: "waiting",
                lastRetry: serverTimestamp(),
              },
              { merge: true }
            );
          }
        } catch (retryError) {
          console.error("Retry failed:", retryError);
          // Fall back to matchmaking screen
          await setDoc(userRef, { status: "matchmaking" }, { merge: true });
          setAppState("matchmaking");
          showNotification("Connection failed, please try again!", "error");
        }
      }, retryDelay);
    }
  };

  const endChat = async () => {
    if (!user || !chatId) return;

    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      const batch = writeBatch(db);
      const usersInChat = chatSnap.data().users;

      // Add a disconnection message to the chat
      const messagesRef = collection(db, "chats", chatId, "messages");
      await addDoc(messagesRef, {
        text: `${userProfile.displayName} has left the chat`,
        createdAt: serverTimestamp(),
        uid: "system",
        photoURL: "",
        displayName: "System",
        isSystemMessage: true,
      });

      // Update chat status to ended
      batch.update(chatRef, {
        status: "ended",
        endedAt: serverTimestamp(),
        endedBy: user.uid,
      });

      // Update user statuses - only the one who ended goes back to matchmaking
      usersInChat.forEach((uid) => {
        const userRef = doc(db, "users", uid);
        if (uid === user.uid) {
          // User who ended the chat goes back to matchmaking
          batch.update(userRef, { status: "matchmaking", currentChatId: null });
        } else {
          // Other user stays in chat but with ended status
          batch.update(userRef, {
            status: "chat_ended",
            currentChatId: chatId,
          });
        }
      });

      await batch.commit();
    }
    setChatId(null);
    setAppState("matchmaking");
  };

  const leaveEndedChat = async () => {
    if (!user) return;

    // Clear the user's current chat and go back to matchmaking
    const userRef = doc(db, "users", user.uid);
    await setDoc(
      userRef,
      { status: "matchmaking", currentChatId: null },
      { merge: true }
    );

    setChatId(null);
    setAppState("matchmaking");
  };

  // Effect for handling tab visibility and cleanup - IMPROVED TO PREVENT DISCONNECTIONS
  useEffect(() => {
    let cleanupTimeout;
    let sessionTimeout;

    const handleVisibilityChange = async () => {
      const currentTime = Date.now();

      if (document.visibilityState === "hidden" && user && userProfile) {
        // Update last seen time
        localStorage.setItem("usaptayo-last-session", currentTime.toString());

        // Only cleanup for non-critical states and only after much longer delay
        if (
          appState === "matchmaking" ||
          appState === "nickname" ||
          appState === "homepage"
        ) {
          cleanupTimeout = setTimeout(async () => {
            // Very conservative cleanup - only if still hidden and in same state
            if (
              document.visibilityState === "hidden" &&
              (appState === "matchmaking" ||
                appState === "nickname" ||
                appState === "homepage") &&
              user &&
              userProfile
            ) {
              try {
                const userRef = doc(db, "users", user.uid);
                // Only update timestamp, don't change status
                await setDoc(
                  userRef,
                  {
                    lastSeen: serverTimestamp(),
                  },
                  { merge: true }
                );
              } catch (error) {
                console.error("Error updating last seen:", error);
              }
            }
          }, 600000); // 10 minutes - much longer delay
        }

        // Set session timeout for inactive tabs
        sessionTimeout = setTimeout(() => {
          // Mark session as expired after 30 minutes of inactivity
          localStorage.setItem("usaptayo-session-expired", "true");
        }, 1800000); // 30 minutes
      } else if (document.visibilityState === "visible") {
        // Cancel any pending cleanup
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
          cleanupTimeout = null;
        }
        if (sessionTimeout) {
          clearTimeout(sessionTimeout);
          sessionTimeout = null;
        }

        // Check if session expired while away
        const sessionExpired = localStorage.getItem("usaptayo-session-expired");
        if (sessionExpired) {
          localStorage.removeItem("usaptayo-session-expired");
          // Force refresh to homepage
          window.location.reload();
          return;
        }

        // Update heartbeat and session time when user returns
        localStorage.setItem("usaptayo-last-session", currentTime.toString());

        if (user && userProfile) {
          try {
            const userRef = doc(db, "users", user.uid);
            await setDoc(
              userRef,
              {
                lastHeartbeat: serverTimestamp(),
                isActive: true,
              },
              { merge: true }
            );
          } catch (error) {
            console.error("Error updating heartbeat:", error);
          }
        }
      }
    };

    const handleBeforeUnload = async () => {
      // Mark session as ended when closing tab/browser
      localStorage.setItem("usaptayo-session-ended", Date.now().toString());
      sessionStorage.clear();

      if (user && userProfile) {
        try {
          const userRef = doc(db, "users", user.uid);
          // Clear user status when leaving
          await setDoc(
            userRef,
            {
              isActive: false,
              lastSeen: serverTimestamp(),
              status: "offline", // Mark as offline
            },
            { merge: true }
          );
        } catch (error) {
          console.error("Error on page unload:", error);
        }
      }
    };

    const handlePageShow = (event) => {
      // Handle when page is restored from cache (back/forward navigation)
      if (event.persisted) {
        // Page was loaded from cache, force refresh for clean state
        window.location.reload();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [user, userProfile, appState]);

  // Effect to handle waiting timeout - IMPROVED FOR MULTI-USER
  useEffect(() => {
    let timeoutTimer;

    if (appState === "waiting" && user) {
      // Longer timeout for better user experience
      timeoutTimer = setTimeout(async () => {
        try {
          const userRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userRef);

          // Only timeout if still in waiting state
          if (userDoc.exists() && userDoc.data().status === "waiting") {
            console.log("Waiting timeout for user:", user.uid);
            await setDoc(
              userRef,
              {
                status: "matchmaking",
                timeoutAt: serverTimestamp(),
              },
              { merge: true }
            );
            setAppState("matchmaking");
            showNotification(
              "Taking too long? Try again - your person might be waiting! ✨",
              "info"
            );
          }
        } catch (error) {
          console.error("Timeout cleanup failed:", error);
        }
      }, 180000); // 3 minutes timeout
    }

    return () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    };
  }, [appState, user]);

  // Enhanced heartbeat system for better connection management
  useEffect(() => {
    let heartbeatInterval;

    if (
      user &&
      userProfile &&
      (appState === "chatting" || appState === "waiting")
    ) {
      // More frequent heartbeat during critical states
      heartbeatInterval = setInterval(async () => {
        try {
          const userRef = doc(db, "users", user.uid);
          await setDoc(
            userRef,
            {
              lastHeartbeat: serverTimestamp(),
              currentState: appState,
              isActive: !document.hidden,
            },
            { merge: true }
          );
        } catch (error) {
          console.error("Heartbeat failed:", error);
        }
      }, 15000); // Every 15 seconds for active states
    }

    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [user, userProfile, appState]);

  switch (appState) {
    case "loading":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LoadingScreen text="Loading..." onSecretTap={handleSecretTap} />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
    case "homepage":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <Homepage
            onAccept={handleHomepageAccept}
            onSecretTap={handleSecretTap}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
    case "nickname":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <NicknamePrompt
            onProfileCreate={handleProfileCreate}
            onSecretTap={handleSecretTap}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
    case "matchmaking":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <MatchmakingScreen
            onFindChat={findChat}
            onReset={handleReset}
            onSecretTap={handleSecretTap}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
    case "waiting":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <LoadingScreen
            text="Manifesting your person... 💫✨"
            onSecretTap={handleSecretTap}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
    case "chatting":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <ChatPage
            userProfile={userProfile}
            chatId={chatId}
            onEndChat={endChat}
            activeAnnouncement={activeAnnouncement}
            onShowAnnouncementModal={showAnnouncementModal}
            onSecretTap={handleSecretTap}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          {announcementModal.show && (
            <AnnouncementModal
              onClose={hideAnnouncementModal}
              onSuccess={() => {
                hideAnnouncementModal();
                showNotification(
                  "Announcement request submitted! 💫",
                  "success"
                );
              }}
            />
          )}
          <Analytics />
        </>
      );
    case "chat_ended":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <ChatPage
            userProfile={userProfile}
            chatId={chatId}
            onEndChat={leaveEndedChat}
            onNextStranger={findChat}
            onBackHome={() => setAppState("matchmaking")}
            chatEnded={true}
            activeAnnouncement={activeAnnouncement}
            onShowAnnouncementModal={showAnnouncementModal}
            onSecretTap={handleSecretTap}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          {announcementModal.show && (
            <AnnouncementModal
              onClose={hideAnnouncementModal}
              onSuccess={() => {
                hideAnnouncementModal();
                showNotification(
                  "Announcement request submitted! 💫",
                  "success"
                );
              }}
            />
          )}
          <Analytics />
        </>
      );
    case "admin":
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <AdminPanel
            onApprove={approveAnnouncement}
            onReject={rejectAnnouncement}
            onLogout={() => {
              setIsAdmin(false);
              setAppState("homepage");
            }}
          />
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
    default:
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <div className="centered-screen">
            <div className="prompt-box">
              <h1
                onClick={handleSecretTap}
                style={{ cursor: "default", userSelect: "none" }}
              >
                UsapTayo
              </h1>
              <p>Something went wrong. Current state: {appState}</p>
              <button onClick={() => setAppState("homepage")}>
                Go to Homepage
              </button>
            </div>
          </div>
          {notification.show && (
            <NotificationToast
              message={notification.message}
              type={notification.type}
            />
          )}
          {confirmDialog.show && (
            <ConfirmDialog
              message={confirmDialog.message}
              onConfirm={confirmDialog.onConfirm}
              onCancel={hideConfirmDialog}
            />
          )}
          <Analytics />
        </>
      );
  }
}

// --- UI Components ---

const Homepage = ({ onAccept, onSecretTap }) => {
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
        <h1
          onClick={onSecretTap}
          style={{ cursor: "default", userSelect: "none" }}
        >
          Welcome to UsapTayo
        </h1>
        <p>
          Welcome to UsapTayo, where main character energy meets mystery! ✨
          Chat anonymously with strangers and create those butterfly moments
          you've been craving. Whether you're looking for deep 3am
          conversations, someone to understand your vibe, or just want to feel
          seen by a stranger who gets it - this is your safe space to connect.
          No filters, no follows, just pure authentic energy and maybe that
          spark you've been manifesting. 💫
        </p>

        <h2>The Vibe Check 📱</h2>
        <p>Keep the energy good and the vibes immaculate:</p>
        <ul>
          <li>Be 18+ because we're keeping it mature and respectful 💅</li>
          <li>Spread good vibes only - toxic energy is not it, bestie</li>
          <li>
            Keep it mysterious! No real names, addresses, or socials - that's
            the whole point ✨
          </li>
          <li>No sending anything that would make your future self cringe</li>
          <li>
            Don't be that person who spams or tries to sell stuff - we're here
            for connections, not transactions
          </li>
          <li>
            If someone's giving you the ick, use the report button - we got you!
            🛡️
          </li>
        </ul>

        <h2>Your Secret is Safe ✨</h2>
        <p>
          Plot twist: everything here disappears like it never happened! 👻 Your
          chats are temporary, your identity stays mysterious, and we don't keep
          receipts. It's giving witness protection but make it romantic.
          Remember though - stranger danger is still real, so keep your personal
          tea to yourself!
        </p>
        <p>
          By entering this digital diary, you're agreeing to use your brain and
          keep things cute. We're not responsible for whatever chaos happens
          between you and your mystery person - that's between y'all and the
          universe! 🌙
        </p>

        <form onSubmit={handleSubmit} className="homepage-form">
          <div className="checkbox-container">
            <label>
              <input
                type="checkbox"
                checked={isOver18}
                onChange={(e) => setIsOver18(e.target.checked)}
              />
              I'm 18+ and ready for the mystery ✨
            </label>
          </div>
          <div className="checkbox-container">
            <label>
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              I promise to keep the vibes immaculate and respect the space 💫
            </label>
          </div>
          <button type="submit" disabled={!isOver18 || !agreeTerms}>
            Enter the Mystery ✨
          </button>
        </form>
      </div>
    </div>
  );
};

const LoadingScreen = ({ text, onSecretTap }) => (
  <div className="centered-screen loading-animation">
    <div className="prompt-box">
      <h1
        onClick={onSecretTap}
        style={{ cursor: "default", userSelect: "none" }}
      >
        UsapTayo
      </h1>
      <div className="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      {text === "Loading..." && <p>Getting your vibe ready... ✨</p>}
    </div>
  </div>
);

const NicknamePrompt = ({ onProfileCreate, onSecretTap }) => {
  const [nickname, setNickname] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (nickname.trim().length > 2) onProfileCreate(nickname.trim());
  };
  return (
    <div className="centered-screen">
      <div className="prompt-box">
        <h1
          onClick={onSecretTap}
          style={{ cursor: "default", userSelect: "none" }}
        >
          UsapTayo
        </h1>
        <p>Choose your mystery name, bestie ✨</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your vibe name..."
          />
          <button type="submit" disabled={nickname.trim().length <= 2}>
            Let's Go! 💫
          </button>
        </form>
      </div>
    </div>
  );
};

const MatchmakingScreen = ({ onFindChat, onReset, onSecretTap }) => {
  return (
    <div className="centered-screen">
      <div className="prompt-box">
        <h1
          onClick={onSecretTap}
          style={{ cursor: "default", userSelect: "none" }}
        >
          UsapTayo
        </h1>
        <p>Ready ka na ba maging backburner?</p>
        <button onClick={onFindChat}>Find Your Mystery Person 💫</button>
        <button onClick={onReset} className="reset-profile-button">
          Start Fresh ✨
        </button>
      </div>
    </div>
  );
};

const ChatPage = ({
  userProfile,
  chatId,
  onEndChat,
  onNextStranger,
  onBackHome,
  chatEnded,
  activeAnnouncement,
  onShowAnnouncementModal,
  onSecretTap,
}) => (
  <div className="chat-page">
    <Header chatEnded={chatEnded} onSecretTap={onSecretTap} />
    {activeAnnouncement && (
      <AnnouncementBanner announcement={activeAnnouncement} />
    )}
    <ChatRoom userProfile={userProfile} chatId={chatId} />
    {!chatEnded && (
      <MessageInput
        userProfile={userProfile}
        chatId={chatId}
        onEndChat={onEndChat}
        onShowAnnouncementModal={onShowAnnouncementModal}
      />
    )}
    {chatEnded && (
      <ChatEndedActions
        onNextStranger={onNextStranger}
        onBackHome={onBackHome}
      />
    )}
  </div>
);

const Header = ({ chatEnded, onSecretTap }) => (
  <header className="header">
    <h1 onClick={onSecretTap} style={{ cursor: "default", userSelect: "none" }}>
      UsapTayo
    </h1>
  </header>
);

const ChatRoom = ({ userProfile, chatId }) => {
  const [messages, setMessages] = useState([]);
  const dummy = useRef();
  const chatRoomRef = useRef();

  useEffect(() => {
    if (!chatId) return;
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(100));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
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
          behavior: "smooth",
          block: "end",
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
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          currentUserUID={userProfile.uid}
        />
      ))}
      <div ref={dummy} className="dummy-div"></div>
    </main>
  );
};

const ChatMessage = ({ message, currentUserUID }) => {
  const { text, uid, photoURL, displayName, isSystemMessage, visibleTo } =
    message;

  // Handle system messages differently
  if (isSystemMessage) {
    // If message has visibleTo field and it's not for current user, don't render
    if (visibleTo && visibleTo !== currentUserUID) {
      return null;
    }

    let systemMessageClass = "system-message";

    // Add specific classes for different types of system messages
    if (text.includes("connected with")) {
      systemMessageClass += " connection";
    } else if (text.includes("has left the chat")) {
      systemMessageClass += " disconnection";
    }

    return (
      <div className={systemMessageClass}>
        <p>{text}</p>
      </div>
    );
  }

  const messageClass = uid === currentUserUID ? "sent" : "received";
  return (
    <div className={`message-container ${messageClass}`}>
      <div className="message-inner">
        <img
          src={
            photoURL ||
            `https://placehold.co/40x40/8b5cf6/ffffff?text=${
              displayName?.[0] || "U"
            }`
          }
          alt="User Avatar"
        />
        <div className={`message-bubble ${messageClass}`}>
          <p className="display-name">{displayName || "Anonymous"}</p>
          <p>{text}</p>
        </div>
      </div>
    </div>
  );
};

const MessageInput = ({
  userProfile,
  chatId,
  onEndChat,
  onShowAnnouncementModal,
}) => {
  const [formValue, setFormValue] = useState("");
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!formValue.trim() || !chatId) return;
    const { uid, photoURL, displayName } = userProfile;
    const messagesRef = collection(db, "chats", chatId, "messages");
    await addDoc(messagesRef, {
      text: formValue,
      createdAt: serverTimestamp(),
      uid,
      photoURL,
      displayName,
    });
    setFormValue("");
  };
  return (
    <form onSubmit={sendMessage} className="message-form">
      <button
        type="button"
        onClick={onEndChat}
        className="end-chat-button"
        title="End Chat"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 6L18 18M6 18L18 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onShowAnnouncementModal}
        className="announcement-button"
        title="Create Paid Announcement"
      >
        📢
      </button>
      <input
        value={formValue}
        onChange={(e) => setFormValue(e.target.value)}
        placeholder="Say something that matters... ✨"
      />
      <button
        type="submit"
        disabled={!formValue.trim()}
        className="send-button"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor" />
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
        {type === "success" && "✓"}
        {type === "error" && "✕"}
        {type === "info" && "ℹ"}
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
  <button
    className="theme-toggle"
    onClick={toggleTheme}
    title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
  >
    {theme === "dark" ? (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </g>
      </svg>
    ) : (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )}
  </button>
);

// Chat Ended Actions Component
const ChatEndedActions = ({ onNextStranger, onBackHome }) => (
  <div className="chat-ended-actions">
    <button onClick={onNextStranger} className="next-stranger-button">
      Find Another Soul ✨
    </button>
    <button onClick={onBackHome} className="back-home-button">
      Back to Reality 💫
    </button>
  </div>
);

// Announcement Banner Component - IMPROVED EXPIRATION HANDLING
const AnnouncementBanner = ({ announcement }) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!announcement || !announcement.expiresAt) return;

    const updateTimeLeft = () => {
      const now = new Date();
      const expiresAt = announcement.expiresAt.toDate();
      const timeDiff = expiresAt - now;

      if (timeDiff > 0) {
        const minutes = Math.floor(timeDiff / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
        setIsExpired(false);
      } else {
        setTimeLeft("Expired");
        setIsExpired(true);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [announcement]);

  // Don't render if expired or no announcement
  if (isExpired || !announcement) {
    return null;
  }

  return (
    <div className="announcement-banner">
      <div className="announcement-content">
        <span className="announcement-icon">📢</span>
        <span className="announcement-text">{announcement.message}</span>
        <span className="announcement-timer">{timeLeft}</span>
      </div>
    </div>
  );
};

// Announcement Modal Component
const AnnouncementModal = ({ onClose, onSuccess }) => {
  const [message, setMessage] = useState("");
  const [step, setStep] = useState(1); // 1: compose, 2: payment

  const handleNext = () => {
    if (message.trim().length > 0) {
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    try {
      // Add to announcements collection for admin review
      await addDoc(collection(db, "announcement_requests"), {
        message: message.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
        paymentAmount: 10,
        duration: 10, // minutes
      });
      onSuccess();
    } catch (error) {
      console.error("Error submitting announcement:", error);
    }
  };

  return (
    <div className="announcement-modal-overlay">
      <div className="announcement-modal">
        <div className="announcement-modal-header">
          <h3>Create Your Billboard ✨</h3>
          <button onClick={onClose} className="close-button">
            ×
          </button>
        </div>

        {step === 1 && (
          <div className="announcement-modal-content">
            <p>Share your vibe with everyone on UsapTayo! 💫</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you want to tell the world? ✨"
              maxLength={200}
              rows={4}
            />
            <div className="char-count">{message.length}/200</div>
            <div className="announcement-pricing">
              <p>
                📍 Your message will be pinned for <strong>10 minutes</strong>
              </p>
              <p>
                💰 Price: <strong>₱10.00</strong>
              </p>
            </div>
            <button
              onClick={handleNext}
              disabled={message.trim().length === 0}
              className="next-button"
            >
              Next: Payment 💳
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="announcement-modal-content">
            <h4>Payment Details 💳</h4>
            <div className="payment-info">
              <div className="payment-method">
                <h5>GCash 📱</h5>
                <p className="payment-number">09615814316</p>
                <p className="payment-name">Oliver Revelo</p>
              </div>
              <div className="payment-method">
                <h5>Maya 💙</h5>
                <p className="payment-number">09615814316</p>
                <p className="payment-name">Oliver Revelo</p>
              </div>
            </div>
            <div className="payment-instructions">
              <p>
                <strong>Instructions:</strong>
              </p>
              <ol>
                <li>Send exactly ₱10.00 to any of the numbers above</li>
                <li>Take a screenshot of your payment confirmation</li>
                <li>Send the screenshot to our admin for verification</li>
                <li>Your announcement will go live within 5 minutes! ⚡</li>
              </ol>
            </div>
            <div className="announcement-preview">
              <h5>Your Message Preview:</h5>
              <div className="preview-banner">📢 {message}</div>
            </div>
            <div className="modal-buttons">
              <button onClick={() => setStep(1)} className="back-button">
                Back
              </button>
              <button onClick={handleSubmit} className="submit-button">
                Submit Request
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Admin Panel Component
const AdminPanel = ({ onApprove, onReject, onLogout }) => {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const requestsRef = collection(db, "announcement_requests");
        const q = query(
          requestsRef,
          where("status", "==", "pending"),
          orderBy("createdAt", "desc")
        );
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const reqs = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
          }));
          setRequests(reqs);
        });
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching announcement requests:", error);
      }
    };

    fetchRequests();
  }, []);

  const formatDate = (date) => {
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Admin Panel - Announcement Requests</h2>
        <button onClick={onLogout} className="logout-button">
          Logout
        </button>
      </div>
      <div className="admin-content">
        <h3>Pending Requests ({requests.length})</h3>
        {requests.length === 0 && (
          <div className="no-requests">
            <p>No pending announcement requests ✨</p>
            <p>All caught up! 🎉</p>
          </div>
        )}
        {requests.map((request) => (
          <div key={request.id} className="request-card">
            <div className="request-header">
              <span className="request-time">
                📅 {formatDate(request.createdAt)}
              </span>
              <span className="request-price">
                💰 ₱{request.paymentAmount || 10}.00
              </span>
            </div>
            <p className="request-message">"{request.message}"</p>
            <div className="request-details">
              <span>Duration: {request.duration || 10} minutes</span>
              <span>Status: {request.status}</span>
            </div>
            <div className="request-actions">
              <button
                onClick={() => {
                  const confirmed = window.confirm(
                    `Approve this announcement?\n\nMessage: "${
                      request.message
                    }"\n\nMake sure payment of ₱${
                      request.paymentAmount || 10
                    } has been received before approving.`
                  );
                  if (confirmed) {
                    onApprove(request.id, request);
                  }
                }}
                className="approve-button"
              >
                ✅ Approve & Publish
              </button>
              <button
                onClick={() => {
                  const reason = prompt("Rejection reason (will be logged):");
                  if (reason) onReject(request.id, reason);
                }}
                className="reject-button"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
