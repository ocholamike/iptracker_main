import Toast from './components/Toast.jsx';
// src/App.js
import './App.css';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ManualRoute from './ManualRoute';
import ProfileForm from './components/profileform';
import DashBoard from './dashboard';
import ChatBox from './ChatBox';
import { completeRecovery } from "./services/authService";
import { v4 as uuidv4 } from 'uuid';

// Firebase (RTDB + Auth + Firestore)
import {onDisconnect } from 'firebase/database';
import {
  database,
  ref as rtdbRef,
  set as rtdbSet,
  onValue,
  get as rtdbGet,
  remove as rtdbRemove,
} from './firebaseConfig';
import { auth, signInAnonymously } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore as db } from './firebaseConfig';

// Firestore helpers & services
import { createBooking, updateBookingStatus } from './services/bookingService';
import { getUserById } from './services/userService';
import {
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy,
  collectionGroup
} from 'firebase/firestore';

export let showToast = (message, type = 'info') => {
  console.log(message, type); // temporary fallback
};

// Leaflet icon helpers
const createRoleIcon = (imageUrl, role = 'cleaner') =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="marker-pin ${role}"></div>
      <div class="icon-wrapper">
        <img src="${imageUrl}" class="icon-image" alt="${role}" />
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

const userMarkerIcon = createRoleIcon(
  'https://img.icons8.com/ios-filled/50/000000/navigation.png',
  'you'
);

// ensure leaflet images resolve in CRA
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// deterministic conversation id helper
const generateConversationId = (a, b) => {
  if (!a || !b) return null;
  return [a, b].sort().join('_');
};

// Recenter hook component
function RecenterMap({ coords, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.setView(coords, map.getZoom(), { animate: true });
    }
  }, [trigger]); // trigger increments when we want to recenter
  return null;
}

const hardcodedCleaners = [
  { id: 'cleaner_1', lat: -1.29, lng: 36.82 },
  { id: 'cleaner_2', lat: -1.3, lng: 36.83 },
  { id: 'cleaner_3', lat: -1.31, lng: 36.84 },
];

function App() {
      // Helper to clear tracking route
      const clearTrackingRoute = () => {
        setIsTrackingTarget(false);
        setTargetCoords(null);
      };
    // Toast notification state
    const [toast, setToast] = useState({ message: '', type: 'info' });
    // Assign the exported showToast to use setToast
    showToast = (message, type = 'info') => setToast({ message, type });
  /* -----------------------------
     SECTION 1 — Session + Profile
     ----------------------------- */
  const [user, setUser] = useState(null); // firebase auth user
  const [userRole, setUserRole] = useState(''); // 'customer' | 'cleaner' | 'viewer'
  const [sessionId, setSessionId] = useState(null); // per-tab unique session
  const [deviceId, setDeviceId] = useState(null); // browser device id
  const [userName, setUserName] = useState(''); // profile name (local)
  const [userProfile, setUserProfile] = useState(null); // fetched Firestore profile
  const [showRoleModal, setShowRoleModal] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [ShowDashboardModal, setShowDashboardModal] = useState(false);
  const [showProfileDot, setShowProfileDot] = useState(false);
  const safeUid = user?.uid || null;


  /* -----------------------------
     SECTION 2 — Geolocation & RTDB
     ----------------------------- */
  const [sharing, setSharing] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [allLocations, setAllLocations] = useState({});
  const watchIdRef = useRef(null);


  /* -----------------------------
     SECTION 3 — Requests & Jobs
     ----------------------------- */
  const [incomingRequest, setIncomingRequest] = useState(null); // for cleaners (requests/{cleanerUid})
  const [currentCustomerRequest, setCurrentCustomerRequest] = useState(null); // for customers (their outgoing request)
  const [activeJob, setActiveJob] = useState(null); // { cleanerUid, customerUid, bookingId, status, customerName, cleanerName }
  const [isAvailable, setIsAvailable] = useState(true); // cleaner availability
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRequestKey, setCurrentRequestKey] = useState(null); // path key for requests (usually cleaner uid or session)
  const [currentRequestId, setCurrentRequestId] = useState(null); // bookingId stored locally

  // tracking
  const [isTrackingTarget, setIsTrackingTarget] = useState(false);
  const [trackingCleaner, setTrackingCleaner] = useState(false); // true = track cleaner, false = track customer
    // true = customer is tracking cleaner, false = cleaner is tracking customer
  const [targetCoords, setTargetCoords] = useState(null); // point we want to show / route to

  /* -----------------------------
     SECTION 4 — Map / UI
     ----------------------------- */
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [incomingMessage, setIncomingMessage] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({});
  const [chatWith, setChatWith] = useState(null);



  /* -----------------------------
     SECTION 5 — Payment & Rating Modals (demo)
     ----------------------------- */
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentBookingId, setPaymentBookingId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingBookingContext, setRatingBookingContext] = useState(null); // { bookingId, cleanerId }
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  /* -----------------------------
     Cleaner profile panel
     ----------------------------- */
  const [showCleanerProfilePanel, setShowCleanerProfilePanel] = useState(false);
  const [cleanerProfile, setCleanerProfile] = useState(null);

  /* -----------------------------
     SECTION 6 — Helpers / refs
     ----------------------------- */
  const [customerNotice, setCustomerNotice] = useState(null);
  const [lowAccuracyWarnShown, setLowAccuracyWarnShown] = useState(false);
  const mountedRef = useRef(true);


  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);
  
   /* -----------------------------
     This is to be used during recovery of profile
     ----------------------------- */
  useEffect(() => {
  completeRecovery().catch(console.error);
  }, []);


  /* -----------------------------
     AUTH: anonymous sign-in & store auth user
     ----------------------------- */
  useEffect(() => {
    signInAnonymously(auth).catch((e) => {
      console.error('Anonymous sign-in failed', e);
    });

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      }
    });
    return () => unsub();
  }, []);

  /* -----------------------------
     DEVICE & SESSION INITIALIZATION
     ----------------------------- */
  useEffect(() => {
    let stored = localStorage.getItem('deviceId');
    if (!stored) {
      stored = uuidv4();
      localStorage.setItem('deviceId', stored);
    }
    setDeviceId(stored);
  }, []);

/* -----------------------------
   REHYDRATE ACTIVE JOB
----------------------------- */
useEffect(() => {
  const raw = localStorage.getItem('activeJob');
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);

    // restore activeJob state for UI
    setActiveJob(parsed);

    // sync handlers / request state
    if (parsed?.bookingId) {
      setCurrentRequestKey(parsed.bookingId);
      setCurrentRequestId(parsed.bookingId);

      // make sure customer side also sees it
      if (userRole === 'customer') {
        setCurrentCustomerRequest({
          cleanerUid: parsed.cleanerUid,
          cleanerName: parsed.cleanerName,
          status: parsed.status,
        });
      }

      // for cleaner side, sync incoming request if needed
      if (userRole === 'cleaner') {
        setIncomingRequest(parsed); // optional depending on your RTDB structure
      }
    }
  } catch {
    localStorage.removeItem('activeJob');
  }
}, [userRole]);


// Whenever activeJob changes
/* -----------------------------
   REHYDRATE ACTIVE JOB & COORDS
    ----------------------------- */
  useEffect(() => {
    if (!user?.uid || !userRole) return; // wait until user + role exist

    // ---- Active Job ----
    const rawJob = localStorage.getItem('activeJob');
    if (rawJob) {
      try {
        const parsedJob = JSON.parse(rawJob);
        setActiveJob(parsedJob);
      } catch (e) {
        console.warn('Failed to parse activeJob from localStorage', e);
        localStorage.removeItem('activeJob');
      }
    }

    // ---- Current Coords (optional) ----
    const rawCoords = localStorage.getItem('currentCoords');
    if (rawCoords) {
      try {
        const parsedCoords = JSON.parse(rawCoords);
        setCurrentCoords(parsedCoords);
      } catch (e) {
        console.warn('Failed to parse currentCoords from localStorage', e);
        localStorage.removeItem('currentCoords');
      }
    }
  }, [user?.uid, userRole]);

  // Whenever activeJob changes
  useEffect(() => {
    if (activeJob) {
      localStorage.setItem('activeJob', JSON.stringify(activeJob));
    } else {
      localStorage.removeItem('activeJob');
    }
  }, [activeJob]);

  // Whenever currentCoords changes
  useEffect(() => {
    if (currentCoords) {
      localStorage.setItem('currentCoords', JSON.stringify(currentCoords));
    }
  }, [currentCoords]);



  const handleRoleSelect = async (role) => {
    setUserRole(role);
    setShowRoleModal(false);

    // create composite device/session ids so same browser can simulate multiple sessions
    let existing = localStorage.getItem('deviceId') || uuidv4();
    if (!existing.startsWith(role)) {
      existing = `${role}_${existing}`;
      localStorage.setItem('deviceId', existing);
    }
    const instance = `${existing}_${uuidv4().slice(0, 6)}`; // unique per open tab
    setDeviceId(existing);
    setSessionId(instance);
    setSharing(true);

    // fetch profile if exists
    if (user?.uid) {
      const profile = await getUserById(safeUid);
      if (profile) {
        setUserProfile(profile);
        setUserName(profile.name || '');
        if (!profile.profileComplete) {
          // encourage completion
          showToast('Please complete your profile', 'info');
          setShowProfileDot(true);
        } else {
          setShowProfileDot(false);
        }
      } else {
        setUserProfile(null);
        // prompt new users to create profile
        showToast('Welcome! Please set up your profile.', 'info');
        setShowProfileDot(true);
      }
    }

    console.log('Role selected', role, 'session', instance);
  };


  /* -----------------------------
   CLEANER: REHYDRATE ACTIVE JOB FROM RTDB
   ----------------------------- */
useEffect(() => {
  if (!user?.uid || userRole !== 'cleaner' || activeJob) return;

  const reqRef = rtdbRef(database, `requests/${safeUid}`);

  const unsub = onValue(reqRef, (snap) => {
    const data = snap.val();
    if (!data) return;

    if (['accepted', 'completed', 'waiting_for_payment'].includes(data.status)) {
      setActiveJob({
        cleanerUid: safeUid,
        cleanerName: data.cleanerName || userName || '',
        customerUid: data.from,
        customerName: data.customerName || '',
        bookingId: data.bookingId || null,
        status: data.status,
        startedAt: data.acceptedAt || Date.now(),
      });

      // tracking resumes automatically
      setIsTrackingTarget(true);
      setTrackingCleaner(false);
    }
  });

  return () => unsub();
}, [user?.uid, userRole, activeJob]);

 /* -----------------------------
   GEOLOCATION WATCH (clean)
   ----------------------------- */

/* -----------------------------
  helper to Immediate geolocation fetch on role/session init
*/
const resolveImmediateCoords = () => {
  if (!('geolocation' in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setCurrentCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });

      // ALSO write to RTDB immediately
      writeLocationToRTDB(pos);
    },
    (err) => console.warn('Immediate geolocation failed', err),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
};


const writeLocationToRTDB = (pos) => {
  if (!pos || !sessionId || userRole === 'viewer') return;

  const { latitude, longitude, accuracy = 0 } = pos.coords;

  const payload = {
    sessionId,
    uid: user?.uid || null,
    role: userRole,
    name: userName || 'Anonymous',
    lat: latitude,
    lng: longitude,
    accuracy: Number(accuracy),
    isAvailable,
    timestamp: Date.now(),
  };

  // 🔥 UI first
  setCurrentCoords({ lat: latitude, lng: longitude });

  const locRef = rtdbRef(database, `locations/${sessionId}`);
  onDisconnect(locRef).remove();

  rtdbSet(locRef, payload).catch(console.error);
};


useEffect(() => {
  if (!sharing) {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    return;
  }

  // 🔥 ALWAYS resolve self location immediately (ALL ROLES)
  resolveImmediateCoords();

  // Continuous watch
  watchIdRef.current = navigator.geolocation.watchPosition(
    writeLocationToRTDB,
    (err) => console.error('Geolocation error', err),
    { enableHighAccuracy: true, maximumAge: 0 }
  );

  return () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };
}, [sharing, deviceId, userRole, userName, isAvailable, sessionId, user?.uid]);

  /* -----------------------------
     RTDB: subscribe to locations (all)
     ----------------------------- */
useEffect(() => {
  const locRef = rtdbRef(database, 'locations');

  const unsub = onValue(locRef, (snap) => {
    const data = snap.val() || {};
    setAllLocations(data);

    if (!activeJob || !isTrackingTarget) return;

    const target = Object.values(data).find((loc) => {
      if (!loc) return false;

      // Cleaner tracking customer
      if (!trackingCleaner) {
        return loc.role === 'customer' && loc.uid === activeJob.customerUid;
      }

      // Customer tracking cleaner
      if (trackingCleaner) {
        return loc.role === 'cleaner' && loc.uid === activeJob.cleanerUid;
      }

      return false;
    });


    if (target?.lat && target?.lng) {
      setTargetCoords({ lat: target.lat, lng: target.lng });
    }
  });

  return () => unsub();
}, [activeJob, isTrackingTarget, trackingCleaner]);


/* -----------------------------
   AUTO TRACKING CONTROLLER
   ----------------------------- */
useEffect(() => {
  if (!activeJob) {
    setIsTrackingTarget(false);
    setTargetCoords(null);
    return;
  }

  // Only track while job is accepted / active
  if (!['accepted', 'in_progress'].includes(activeJob.status)) {
    setIsTrackingTarget(false);
    setTargetCoords(null);
    return;
  }

  if (userRole === 'customer') {
    // customer tracks cleaner
    setTrackingCleaner(true);
    setIsTrackingTarget(true);
  }

  if (userRole === 'cleaner') {
    // cleaner tracks customer
    setTrackingCleaner(false);
    setIsTrackingTarget(true);
  }
  
}, [activeJob, userRole]);


  /* -----------------------------
     VISIBILITY RULES: compute visible markers
     - Customer: sees cleaners only (available)
     - Cleaner: sees ONLY the customer who requested them (or their active job) and customer sees back the cleaner who they requested
     ----------------------------- */
  // Deduplicate customer locations: keep only the latest for each customer uid
  const customerLatest = {};
  Object.entries(allLocations).forEach(([id, loc]) => {
    if (loc && loc.role === 'customer' && loc.uid) {
      if (!customerLatest[loc.uid] || (loc.timestamp > (customerLatest[loc.uid].timestamp || 0))) {
        customerLatest[loc.uid] = { ...loc, _id: id };
      }
    }
  });
  // Build deduped locations
  const dedupedLocations = { ...allLocations };
  Object.values(customerLatest).forEach((loc) => {
    // Remove all other locations for this uid except the latest
    Object.entries(allLocations).forEach(([id, l]) => {
      if (l.role === 'customer' && l.uid === loc.uid && id !== loc._id) {
        delete dedupedLocations[id];
      }
    });
  });

  const visibleMarkers = Object.entries(dedupedLocations).filter(([id, loc]) => {
    if (!loc || !loc.lat || !loc.lng || !loc.role) return false;
    const isSelf = loc.sessionId === sessionId || loc.uid === user?.uid;
    if (isSelf) return true;

    if (userRole === 'customer') {
      if (loc.role !== 'cleaner') return false;

      // If customer has active job → show ONLY their cleaner
      if (activeJob?.cleanerUid) {
        return loc.uid === activeJob.cleanerUid;
      }

      // If customer has a pending request but no active job yet
      if (currentCustomerRequest?.cleanerUid) {
        return loc.uid === currentCustomerRequest.cleanerUid;
      }

      // Otherwise show only available cleaners
      return loc.isAvailable !== false;
    }

    if (userRole === 'cleaner') {
      // Cleaner sees ONLY their active customer
      if (activeJob?.customerUid) {
        return loc.role === 'customer' && loc.uid === activeJob.customerUid;
      }

      return false;
    }

    // viewer sees none
    return userRole === 'viewer';
  });

  /* -----------------------------
     REQUEST: Customer sends a request to cleaner
     - enforce: customer must have profile (name)
     ----------------------------- */
  const requestCleaner = useCallback(async (cleanerUidOrSession) => {
    if (!user?.uid) { showToast('Not signed in', 'error'); return; }
    if (userRole !== 'customer') { showToast('Only customers can request cleaners', 'error'); return; }

    // ensure profile exists (customer must have a name in Firestore profile)
    const profile = await getUserById(safeUid);
    if (!profile || !profile.name) {
      setShowProfileModal(true);
      showToast('Please create your profile (name) before requesting a cleaner.', 'error');
      return;
    }
    
    if (!profile || !profile.name) {
      setShowDashboardModal(true);
      showToast('Please create your Admin profile (name) before proceeding to Dashboard.', 'error');
      return;
    }

    // write RTDB request: path requests/{cleanerUidOrSession}
    try {
      const reqPath = `requests/${cleanerUidOrSession}`;
      await rtdbSet(rtdbRef(database, reqPath), {
        from: safeUid,
        fromName: profile.name,
        to: cleanerUidOrSession,
        customerName: profile.name,
        status: 'pending',
        timestamp: Date.now(),
      });

      // save the key so we can later update that exact RTDB path
      setCurrentRequestKey(cleanerUidOrSession);
      setCurrentCustomerRequest({ cleanerUid: cleanerUidOrSession, cleanerName: null, status: 'pending' });
      setCustomerNotice({ title: 'Request sent', body: 'Waiting for cleaner response', type: 'info' });
    } catch (err) {
      console.error('requestCleaner error', err);
      showToast('Failed to send request', 'error');
    }
  }, [user, userRole]);

  /* -----------------------------
     Listen for customer's request responses (customer side)
     - open payment modal when request status === 'waiting_for_payment'
     ----------------------------- */
useEffect(() => {
  if (!user?.uid || userRole !== 'customer') return;
  const reqRef = rtdbRef(database, 'requests');

  const unsub = onValue(reqRef, (snap) => {
  const data = snap.val() || {};

  if (!safeUid) {
    setCurrentCustomerRequest(null);
    return;
  }

  // find requests where from === current user
  const my = Object.entries(data).filter(
    ([, req]) => req?.from === safeUid
  );

  if (!my.length) {
    setCurrentCustomerRequest(null);
    return;
  }

  const [, latest] = my[my.length - 1];

  const cleanerIdOrSession = latest.to || latest.cleanerUid;
  const cleanerNameFromRTDB = latest.cleanerName || latest.toName || null;

  setCurrentCustomerRequest({
    cleanerUid: cleanerIdOrSession,
    cleanerName: cleanerNameFromRTDB,
    status: latest.status,
  });

    // -----------------------------
    // Status handling
    // -----------------------------
    if (latest.status === 'accepted') {
      setCustomerNotice({
        title: 'Cleaner Accepted',
        body: `Cleaner ${latest.cleanerName || latest.toName || ''} is on the way`,
        type: 'success'
      });

      setCurrentRequestKey(cleanerIdOrSession || currentRequestKey);

      // ✅ Initialize activeJob on customer side
      setActiveJob((prev) => prev || {
        cleanerUid: cleanerIdOrSession,
        cleanerName: cleanerNameFromRTDB || '',
        customerUid: safeUid,
        customerName: userName || '',
        bookingId: latest.bookingId || null,
        status: 'accepted',
        startedAt: Date.now(),
      });

      // ✅ Start tracking cleaner immediately
      setTrackingCleaner(true);
      setIsTrackingTarget(true);

      // ✅ Set initial targetCoords immediately
      const cleanerLoc = Object.values(allLocations).find(
        (loc) => loc.role === 'cleaner' && loc.uid === cleanerIdOrSession
      );
      if (cleanerLoc) {
        setTargetCoords({ lat: cleanerLoc.lat, lng: cleanerLoc.lng });
        setRecenterTrigger((t) => t + 1);
      }
    }

    if (latest.status === 'rejected') {
      setCustomerNotice({
        title: 'Cleaner Rejected',
        body: 'Try another cleaner',
        type: 'error'
      });
      setCurrentCustomerRequest(null);
    }

    if (latest.status === "waiting_for_payment") {
      setCustomerNotice({
        title: 'Job Finished',
        body: 'Please complete payment',
        type: 'info'
      });

      if (latest.bookingId) {
        setPaymentBookingId(latest.bookingId);
      }
      setShowPaymentModal(true);
    }

    if (latest.status === "paid" || latest.status === "closed") {
      localStorage.removeItem('activeJob');
      setCustomerNotice({
        title: 'Payment received',
        body: 'Thank you — job complete',
        type: 'success'
      });
      setCurrentCustomerRequest(null);
      setIncomingRequest(null);
      setActiveJob(null);
      setTrackingCleaner(false);
      setIsTrackingTarget(false);
      setCurrentRequestKey(null);
      setCurrentRequestId(null);
      return;
    }
  });

  return () => unsub();
}, [user?.uid, userRole, allLocations]);


  /* -----------------------------
     Cleaner: listen for incoming request on requests/{cleanerUid}
     ----------------------------- */
  useEffect(() => {
    if (!user?.uid || userRole !== 'cleaner') return;
    const reqPath = rtdbRef(database, `requests/${safeUid}`);
    const unsub = onValue(reqPath, (snap) => {
      const data = snap.val();
      if (!data) {
        setIncomingRequest(null);
        return;
      }
      // handle lifecycle transitions
      if (data.status === 'pending') {
        setIncomingRequest(data);
      } else if (data.status === 'accepted') {
        // keep `accepted` briefly or rely on local activeJob state
        setIncomingRequest(null);
      } else if (data.status === 'cancelled' || data.status === 'rejected') {
        // if cancelled while we had an active job, clear it
        if (activeJob?.customerUid === data.from) {
          setActiveJob(null);
          setIsAvailable(true);
          localStorage.removeItem('activeJob');
        }
        setIncomingRequest(null);
      } else if (data.status === "paid" || data.status === "closed") {
        // payment completed by customer -> cleanup job, bring cleaner online
        localStorage.removeItem('activeJob');
        setActiveJob(null);
        setIncomingRequest(null);
        setIsTrackingTarget(false);
        setIsAvailable(true);
        setCustomerNotice({ title: 'Job paid', body: 'You are back online', type: 'success' });
      } else if (data.status === 'completed' || data.status === 'waiting_for_payment') {
        // customer hasn't paid yet but cleaner marked finished
        // typically we keep incomingRequest null but ensure activeJob exists
      }
    });

    return () => unsub();
  }, [user?.uid, userRole, activeJob]);

  /* -----------------------------
     Cleaner: Accept Request
     ----------------------------- */
const acceptRequest = async () => {
  if (!incomingRequest || !user?.uid) {
    showToast('No incoming request', 'error');
    return;
  }

  setIsProcessing(true);

  try {
    // -------------------------
    // 0️⃣ Resolve cleaner snapshot
    // -------------------------
    const resolveCleanerSnapshot = async (cleanerId) => {
      if (!cleanerId) return null;
      try {
        const cDoc = await getDoc(doc(db, "users", cleanerId));
        if (!cDoc.exists()) return null;

        const c = cDoc.data();
        return {
          cleanerId,
          cleanerName: c.name || c.meta?.name || c.email || 'Cleaner',
          cleanerCategories: Array.isArray(c.categories)
            ? c.categories
            : c.category
              ? [c.category]
              : [],
        };
      } catch (e) {
        console.warn('Failed to resolve cleaner snapshot', e);
        return null;
      }
    };

    const cleanerSnapshot = await resolveCleanerSnapshot(safeUid);

    // -------------------------
    // 1️⃣ Mark RTDB request accepted
    // -------------------------
    const reqRefPath = `requests/${safeUid}`;
    const customerName = incomingRequest.customerName || incomingRequest.fromName || '';

    const acceptedPayload = {
      ...incomingRequest,
      status: 'accepted',
      acceptedAt: Date.now(),
      cleanerUid: safeUid,
      cleanerName: cleanerSnapshot?.cleanerName || userName || '',
      customerName: customerName,
    };

    await rtdbSet(rtdbRef(database, reqRefPath), acceptedPayload);
    setCurrentRequestKey(safeUid);

    // -------------------------
    // 2️⃣ Update cleaner location
    // -------------------------
    const updateLocation = async (lat, lng) => {
      if (!sessionId) return;

      await rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
        sessionId,
        deviceId,
        uid: user?.uid || null,
        role: userRole,
        name: userName || 'Cleaner',
        lat,
        lng,
        isAvailable: false,
        timestamp: Date.now(),
      }).catch(console.error);
    };

    if (sessionId) {
      if (!currentCoords) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            writeLocationToRTDB(pos);
            updateLocation(pos.coords.latitude, pos.coords.longitude);
          },
          (err) => console.warn('Immediate geolocation failed', err),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );
      } else {
        updateLocation(currentCoords.lat, currentCoords.lng);
      }
    }

    setIsAvailable(false);

    // -------------------------
    // 3️⃣ Create booking in Firestore
    // -------------------------
    const customerId = incomingRequest.from;

    const bookingPayload = {
      customerId,
      customerName: customerName || null,
      cleanerId: safeUid,
      cleanerName: cleanerSnapshot?.cleanerName || userName || 'Cleaner',
      cleanerCategories: cleanerSnapshot?.cleanerCategories || [],
      serviceType: 'standard', // Required for createBooking
      serviceCategory: cleanerSnapshot?.cleanerCategories?.[0] || 'standard',
      location: {
        lat: currentCoords?.lat ?? null,
        lng: currentCoords?.lng ?? null,
      },
      price: 0,
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    const bookingResult = await createBooking(bookingPayload);

    // fallback if createBooking did not return id
    const bookingId = (bookingResult && bookingResult.id) ? bookingResult.id : (bookingResult || null);

    // ✅ RTDB: do not write undefined
    await rtdbSet(rtdbRef(database, reqRefPath), {
      ...acceptedPayload,
      bookingId, // now guaranteed null or valid id
    });


    // -------------------------
    // 5️⃣ Update local active job
    // -------------------------
    setActiveJob({
      cleanerUid: safeUid,
      cleanerName: cleanerSnapshot?.cleanerName || userName || '',
      customerUid: customerId,
      customerName,
      bookingId,
      status: 'accepted',
      startedAt: Date.now(),
    });

    setCurrentRequestId(bookingId);
    setIncomingRequest(null);
    setIsProcessing(false);
    setCustomerNotice({
      title: 'Accepted',
      body: 'You accepted the job. Tracking enabled.',
      type: 'success',
    });

    // -------------------------
    // 6️⃣ Center map to customer
    // -------------------------
    const customerEntry = Object.entries(allLocations).find(([, loc]) => loc.uid === customerId);
    if (customerEntry) {
      const [, loc] = customerEntry;
      setTargetCoords({ lat: loc.lat, lng: loc.lng });
      setRecenterTrigger((t) => t + 1);
    }
    

  } catch (err) {
    console.error('acceptRequest failed', err);
    setIsProcessing(false);
    showToast('Failed to accept request (see console)', 'error');
  }
};


  /* -----------------------------
     Cleaner: Track Customer on Map & Customer: Track Customer on  Map
     ----------------------------- */
  const handleTrackCustomer = () => {
    if (!activeJob?.customerUid) {
      showToast('No active job customer set', 'error');
      return;
    }

    const found = Object.entries(allLocations).find(([, loc]) => loc.uid === activeJob.customerUid);

    if (found) {
      const [, loc] = found;
      setTargetCoords({ lat: loc.lat, lng: loc.lng });
      setIsTrackingTarget(true);
      setRecenterTrigger((t) => t + 1);
    } else {
      showToast('Customer location not found', 'error');
    }
  };

  const handleTrackCleaner = () => {
    if (!activeJob?.cleanerUid) {
      showToast('No active job cleaner set', 'error');
      return;
    }

    const found = Object.entries(allLocations).find(
      ([, loc]) => loc.uid === activeJob.cleanerUid
    );

    if (found) {
      const [, loc] = found;
      setTargetCoords({ lat: loc.lat, lng: loc.lng });
      setIsTrackingTarget(true);
      setRecenterTrigger((t) => t + 1);
    } else {
      showToast('Cleaner location not found', 'error');
    }
  };


  /* -----------------------------
     Cleaner: Finish Job
     ----------------------------- */
  const finishJob = async () => {
    if (!activeJob?.bookingId || !activeJob?.customerUid || !activeJob?.cleanerUid) {
      showToast('No active job to finish', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      // 1) Clear any manual tracking route
      if (activeJob.manualRouteId) {
        const manualRouteRef = rtdbRef(database, `manual_routes/${activeJob.manualRouteId}`);
        await rtdbSet(manualRouteRef, null);
      }

      // Stop any in-progress tracking on the map
      clearTrackingRoute();

      // 2) Update Firestore booking -> completed
      await updateBookingStatus(activeJob.bookingId, 'completed');

      // 3) Update RTDB request so the customer gets notified
      const reqPath = `requests/${activeJob.cleanerUid}`;
      await rtdbSet(rtdbRef(database, reqPath), {
        from: activeJob.customerUid,
        fromName: activeJob.customerName || '',
        to: activeJob.cleanerUid,
        cleanerName: activeJob.cleanerName || '',
        customerName: activeJob.customerName || '',
        status: "waiting_for_payment", // trigger payment modal for customer
        bookingId: activeJob.bookingId,
        timestamp: Date.now(),
      });

      // 4) Update local state
      setActiveJob((prev) => prev ? { ...prev, status: 'completed' } : prev);
      setIsProcessing(false);

      // 5) Notify the customer
      setCustomerNotice({
        title: 'Job finished',
        body: 'Waiting for customer to pay',
        type: 'info',
      });

      // 6) Stop showing manual route UI
      setIsTrackingTarget(false);
      setTargetCoords(null);

    } catch (err) {
      console.error('finishJob error', err);
      setIsProcessing(false);
      showToast('Failed to finish job', 'error');
    }
  };

  /* -----------------------------
     Cleaner: Cancel Active Job
     ----------------------------- */
  const cancelActiveJob = async (reason = 'cancelled_by_cleaner') => {
    if (!activeJob) { showToast('No active job', 'error'); return; }
    setIsProcessing(true);
    try {
      clearTrackingRoute();
      // update RTDB request to cancelled
      if (activeJob.cleanerUid) {
        await rtdbSet(rtdbRef(database, `requests/${activeJob.cleanerUid}`), {
          from: activeJob.customerUid,
          fromName: activeJob.customerName || '',
          status: 'cancelled',
          reason,
          timestamp: Date.now(),
        });
      }
      // update Firestore booking
      if (activeJob.bookingId) {
        await updateBookingStatus(activeJob.bookingId, 'cancelled');
      }

      // mark cleaner available
      if (sessionId) {
        await rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
          sessionId,
          deviceId,
          uid: safeUid,
          role: userRole,
          name: userName || 'Cleaner',
          lat: currentCoords?.lat ?? null,
          lng: currentCoords?.lng ?? null,
          isAvailable: true,
          timestamp: Date.now(),
        });
      }
      setIsAvailable(true);
      setActiveJob(null);
      setIsProcessing(false);
    } catch (err) {
      console.error('cancelActiveJob', err);
      setIsProcessing(false);
      showToast('Failed to cancel job', 'error');
    }
  };

  /* -----------------------------
     Customer: Cancel Request
     ----------------------------- */
  const cancelCustomerRequest = async () => {
    if (!currentCustomerRequest?.cleanerUid) { showToast('No active request', 'error'); return; }
    try {
      const cleanerUid = currentCustomerRequest.cleanerUid;
      await rtdbSet(rtdbRef(database, `requests/${cleanerUid}`), {
        from: safeUid,
        fromName: userName || '',
        status: 'cancelled',
        timestamp: Date.now(),
      });

      setCurrentCustomerRequest(null);
      setCurrentRequestKey(null);
      setCustomerNotice({ title: 'Cancelled', body: 'Your request was cancelled', type: 'error' });
    } catch (err) {
      console.error('cancelCustomerRequest', err);
      showToast('Failed to cancel request', 'error');
    }
  };

  /* -----------------------------
     Receipt printing helper
     ----------------------------- */
  const printReceipt = async (receipt, bookingId, cleanerName, customerName) => {
    if (!receipt) { showToast('No receipt to print', 'error'); return; }

    // Attempt to enrich with booking and user details if available
    let booking = null;
    let cleaner = null;
    let customer = null;

    try {
      if (bookingId) {
        const snap = await getDoc(doc(db, 'bookings', bookingId));
        if (snap.exists()) booking = { id: snap.id, ...snap.data() };
      }
    } catch (e) {
      console.warn('Failed fetch booking for receipt', e);
    }

    try {
      if (booking?.cleanerId) cleaner = await getUserById(booking.cleanerId);
      else if (cleanerName && typeof cleanerName === 'string') cleaner = { name: cleanerName };
    } catch (e) { console.warn('Failed fetch cleaner', e); }

    try {
      if (booking?.customerId) customer = await getUserById(booking.customerId);
      else if (customerName && typeof customerName === 'string') customer = { name: customerName };
    } catch (e) { console.warn('Failed fetch customer', e); }

    const reqAt = booking?.createdAt ? (booking.createdAt.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt)) : null;
    const closedAtRaw = booking?.closedAt || booking?.completedAt || booking?.closed_at || booking?.completed_at || booking?.paidAt || booking?.paid_at || null;
    const closedAt = closedAtRaw ? (closedAtRaw.toDate ? closedAtRaw.toDate() : new Date(closedAtRaw)) : null;
    const timeTaken = (reqAt && closedAt) ? (function() {
      const ms = closedAt.getTime() - reqAt.getTime();
      const sec = Math.floor(ms/1000); const hrs = Math.floor(sec/3600); const mins = Math.floor((sec%3600)/60);
      if (hrs > 0) return `${hrs}h ${mins}m`; if (mins > 0) return `${mins}m`; return `${sec}s`;
    })() : (closedAt ? '—' : '—');

    const amount = receipt.amount || booking?.paidAmount || booking?.price || '—';

    const html = `
      <html>
      <head>
        <title>Receipt ${receipt.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
          .receipt { max-width: 520px; margin: 0 auto; border: 1px solid #ddd; padding: 18px; border-radius: 6px; }
          .brand { text-align: center; margin-bottom: 12px; }
          h1 { margin: 0; font-size: 20px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
          .row { display:flex; justify-content:space-between; margin:6px 0; }
          .bold{font-weight:700}
          .total { font-weight:700; font-size:18px; margin-top:10px }
          .paid { display:inline-block; background:#16a34a;color:#fff;padding:4px 8px;border-radius:4px;font-weight:700;margin-top:10px;}
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="brand">
            <h1>Cleaning Service Receipt</h1>
            <div class="meta">Booking: ${booking?.bookingId || booking?.id || bookingId || '—'} | Receipt: ${receipt.id}</div>
          </div>

          <div class="row"><div class="bold">Service</div><div>${booking?.serviceType || 'Cleaning'}</div></div>
          <div class="row"><div class="bold">Category</div><div>${(cleaner && cleaner.categories && cleaner.categories.join(', ')) || booking?.category || '—'}</div></div>

          <hr />

          <div class="row"><div class="bold">Customer</div><div>${(customer && (customer.name || customer.fullName)) || customerName || '—'}</div></div>
          <div class="row"><div class="bold">Customer Phone</div><div>${(customer && customer.phone) || '—'}</div></div>

          <div class="row"><div class="bold">Cleaner</div><div>${(cleaner && (cleaner.name || cleaner.fullName)) || cleanerName || '—'}</div></div>
          <div class="row"><div class="bold">Cleaner Phone</div><div>${(cleaner && cleaner.phone) || '—'}</div></div>

          <hr />

          <div class="row"><div class="bold">Requested At</div><div>${reqAt ? reqAt.toLocaleString() : '—'}</div></div>
          <div class="row"><div class="bold">Completed At</div><div>${closedAt ? closedAt.toLocaleString() : '—'}</div></div>
          <div class="row"><div class="bold">Time Taken</div><div>${timeTaken}</div></div>

          <div class="total"><div class="row"><div class="bold">Total</div><div>${typeof amount === 'number' ? amount : amount}</div></div></div>

          <div style="text-align:center; margin-top:10px">
            <span class="paid">PAID</span>
            <div style="margin-top:10px;font-size:12px;color:#666">${new Date(receipt.date).toLocaleString()}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (!win) { showToast('Popup blocked. Allow popups to print receipts.', 'error'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  /* -----------------------------
     Customer: Payment (demo)
     ----------------------------- */
  const submitPayment = async () => {
  if (!paymentAmount || isProcessing) return;

  setIsProcessing(true);

  try {
    /* ----------------------------------------------------
       1. Resolve bookingId
    ---------------------------------------------------- */
    const bookingId = activeJob?.bookingId || paymentBookingId || null;

    /* ----------------------------------------------------
       2. Resolve cleanerId ONCE (single source of truth)
    ---------------------------------------------------- */
    let resolvedCleanerId =
      activeJob?.cleanerUid ||
      currentCustomerRequest?.cleanerUid ||
      currentRequestKey ||
      null;

    if (!resolvedCleanerId && bookingId) {
      try {
        const bDoc = await getDoc(doc(db, "bookings", bookingId));
        if (bDoc.exists()) {
          const d = bDoc.data();
          resolvedCleanerId = d?.cleanerId || d?.cleanerUid || null;
        }
      } catch (e) {
        console.warn("Failed to resolve cleanerId from booking", e);
      }
    }

    /* ----------------------------------------------------
       3. Mark booking as PAID
    ---------------------------------------------------- */
    if (bookingId) {
      await updateDoc(doc(db, "bookings", bookingId), {
        status: "paid",
        paidAmount: Number(paymentAmount),
        paidAt: serverTimestamp(),
      });
    }

    /* ----------------------------------------------------
       4. Update RTDB request (for live cleaner feedback)
    ---------------------------------------------------- */
    const cleanerPath =
      currentRequestKey ||
      currentCustomerRequest?.cleanerUid ||
      activeJob?.cleanerUid;

    const customerId = safeUid;
    const customerNameToUse =
      userName || userProfile?.name || "Customer";

    const cleanerNameToUse =
      activeJob?.cleanerName ||
      currentCustomerRequest?.cleanerName ||
      "";

    if (cleanerPath) {
      await rtdbSet(rtdbRef(database, `requests/${cleanerPath}`), {
        from: customerId,
        fromName: customerNameToUse,
        to: cleanerPath,
        cleanerName: cleanerNameToUse,
        customerName: customerNameToUse,
        status: "paid",
        amount: Number(paymentAmount),
        bookingId,
        timestamp: Date.now(),
      });
    }

    /* ----------------------------------------------------
       5. Generate receipt (UI demo)
    ---------------------------------------------------- */
    const receipt = {
      id: Math.random().toString(36).substring(2, 10),
      amount: Number(paymentAmount),
      date: new Date().toISOString(),
    };
    setPaymentReceipt(receipt);

    /* ----------------------------------------------------
       6. Write receipt + payment to Firestore (FIXED)
    ---------------------------------------------------- */
    try {
      const receiptDoc = await addDoc(collection(db, "receipts"), {
        receiptId: receipt.id,
        bookingId,
        cleanerId: resolvedCleanerId,
        cleanerName: cleanerNameToUse,
        customerId,
        customerName: customerNameToUse,
        amount: Number(paymentAmount),
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, "payments"), {
        receiptRef: receiptDoc.id,
        bookingId,
        amount: Number(paymentAmount),      // 🔥 numeric
        payerId: customerId,
        payeeId: resolvedCleanerId,          // 🔥 always resolved if possible
        status: "completed",
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("Failed to write receipt/payment to Firestore", e);
    }

    /* ----------------------------------------------------
       7. Set rating context (reuse resolvedCleanerId)
    ---------------------------------------------------- */
    setRatingBookingContext({
      bookingId,
      cleanerId: resolvedCleanerId,
    });

    /* ----------------------------------------------------
       8. Show receipt + cleanup UI
    ---------------------------------------------------- */
    setShowPaymentModal(true);
    setCurrentCustomerRequest(null);
    setCurrentRequestId(bookingId);
    setCurrentRequestKey(null);

  } catch (err) {
    console.error("❌ submitPayment() error:", err);
    showToast("Payment failed. Check console.", "error");
  } finally {
    setIsProcessing(false);
  }
};


  /* -----------------------------
     Rating: 1-5 stars
     ----------------------------- */
  const submitRating = async (value = ratingValue, comment = ratingComment) => {
    if (isProcessing || !value) return;

    const bookingId =
      ratingBookingContext?.bookingId ||
      activeJob?.bookingId ||
      paymentBookingId;

    let cleanerId =
      ratingBookingContext?.cleanerId ||
      activeJob?.cleanerUid ||
      currentRequestKey;

    if (!cleanerId && bookingId) {
      try {
        const bDoc = await getDoc(doc(db, 'bookings', bookingId));
        if (bDoc.exists()) {
          const d = bDoc.data();
          cleanerId = d?.cleanerId || d?.cleanerUid || cleanerId;
        }
      } catch (e) {
        console.warn('Failed to load booking to resolve cleanerId', e);
      }
    }

    if (!bookingId || !cleanerId) {
      console.error("Rating aborted: missing bookingId or cleanerId", { bookingId, cleanerId });
      showToast('Cannot submit rating: missing booking or cleaner information.', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Save rating
      await addDoc(collection(db, "ratings"), {
        bookingId,
        cleanerUid: cleanerId,
        customerUid: user?.uid,
        rating: value,
        comment: comment || "",
        createdAt: serverTimestamp(),
      });

      // 2. Mark booking as closed
      await updateDoc(doc(db, "bookings", bookingId), {
        status: "closed",
        closedAt: serverTimestamp(),
      });

      // 3. Delete request path (both possible keys)
      try {
        await rtdbRemove(rtdbRef(database, `requests/${cleanerId}`));
      } catch (e) { /* ignore */ }
      try {
        if (currentRequestKey) await rtdbRemove(rtdbRef(database, `requests/${currentRequestKey}`));
      } catch (e) { /* ignore */ }

      // 4. Compute aggregate rating (avg + count) from ratings collection for this cleaner
      try {
        const ratingsQ = query(collection(db, 'ratings'), where('cleanerUid', '==', cleanerId));
        const snap = await getDocs(ratingsQ);
        let sum = 0;
        let cnt = 0;
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d && typeof d.rating === 'number') {
            sum += d.rating;
            cnt += 1;
          } else if (d && !isNaN(Number(d.rating))) {
            sum += Number(d.rating);
            cnt += 1;
          }
        });
        const avg = cnt ? (sum / cnt) : 0;

        // update cleaner user doc with aggregated stats and increment completedJobs (Option A)
        try {
          const userRef = doc(db, 'users', cleanerId);
          const userDoc = await getDoc(userRef);
          const prevCompleted = userDoc.exists() ? (userDoc.data().completedJobs || 0) : 0;
          const newCompleted = prevCompleted + 1;

          await updateDoc(userRef, {
            averageRating: avg,
            ratingCount: cnt,
            completedJobs: newCompleted,
            lastRatedAt: serverTimestamp()
          });
        } catch (uErr) {
          console.warn('Failed to update cleaner user doc with aggregates', uErr);
        }
      } catch (aggErr) {
        console.warn('Failed to compute rating aggregate', aggErr);
      }

      // 5. Mark cleaner available in locations RTDB
      if (sessionId && userRole === "cleaner") {
        // If we don't have currentCoords, get an immediate position
        if (!currentCoords) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              // write RTDB using the new position
              writeLocationToRTDB(pos);

              // Also update this session node immediately
              rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
                sessionId,
                deviceId,
                uid: user?.uid || null,
                role: userRole,
                name: userName || "Cleaner",
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                isAvailable: true,
                timestamp: Date.now(),
              }).catch((e) => console.error("Failed save location", e));
            },
            (err) => console.warn("Immediate geolocation failed", err),
            { enableHighAccuracy: true, maximumAge: 2, timeout: 10000 }
          );
        } else {
          // If we already have currentCoords, use it directly
          rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
            sessionId,
            deviceId,
            uid: user?.uid || null,
            role: userRole,
            name: userName || "Cleaner",
            lat: currentCoords.lat,
            lng: currentCoords.lng,
            isAvailable: true,
            timestamp: Date.now(),
          }).catch((e) => console.error("Failed save location", e));
        }
      }

      // 6. Reset UI state
      localStorage.removeItem('activeJob');

      setActiveJob(null);
      setCurrentRequestId(null);
      setCurrentRequestKey(null);
      setShowRatingModal(false);
      setRatingBookingContext(null);
      setCurrentCustomerRequest(null);
      setIncomingRequest(null);
      setPaymentReceipt(null);
      setRatingValue(0);
      setRatingComment('');
      setIsTrackingTarget(false);
      setIsAvailable(true);
      setTargetCoords(null);

      setCustomerNotice({ title: "Done", body: "Rating submitted and job closed", type: "success" });
    } catch (err) {
      console.error("❌ submitRating() error:", err);
      showToast('Failed to submit rating. Check console.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  /* -----------------------------
     View Cleaner Profile helper (loads profile + aggregates)
     ----------------------------- */
 const viewCleanerProfile = async (cleanerUid) => {
  if (!cleanerUid) { showToast('Cleaner profile not available', 'error'); return; }

  setCleanerProfile(null); // show loading
  setShowCleanerProfilePanel(true); // open modal immediately

  try {
    const prof = await getUserById(cleanerUid);
    // compute ratings
    let avg = 0, count = 0;
    try {
      const ratingsQ = query(collection(db, 'ratings'), where('cleanerUid', '==', cleanerUid));
      const snap = await getDocs(ratingsQ);
      let sum = 0, cnt = 0;
      snap.forEach(s => {
        const d = s.data();
        if (d && typeof d.rating === 'number') { sum += d.rating; cnt += 1; }
        else if (d && !isNaN(Number(d.rating))) { sum += Number(d.rating); cnt += 1; }
      });
      avg = cnt ? (sum / cnt) : 0;
      count = cnt;
    } catch (e) { console.warn(e); }

    setCleanerProfile({
      uid: cleanerUid,
      name: prof?.name || 'Anonymous cleaner',
      category: prof?.category || 'Not specified',
      avgRating: avg,
      ratingCount: count,
      completedJobs: prof?.completedJobs || 0,
      bio: prof?.bio || ''
    });

  } catch (e) {
    console.error(e);
    setCleanerProfile({
      uid: cleanerUid,
      name: 'Cleaner',
      avgRating: 0,
      ratingCount: 0,
      completedJobs: 0,
      bio: ''
    });
  }
};


  /* -----------------------------
     Render popup JSX
     ----------------------------- */
  function renderPopupContentJSX(loc) {
    const isSelf = (loc.uid === user?.uid || loc.sessionId === sessionId);
    if (isSelf) {
      return (
        <div>
          <strong>You (this device)</strong>
        </div>
      );
    }

    if (userRole === 'customer' && loc.role === 'cleaner') {
      // Disable request button if a request is already sent to this cleaner
      const hasActiveRequest =
        currentCustomerRequest &&
        (currentCustomerRequest.cleanerUid === loc.uid ||
         currentCustomerRequest.cleanerUid === loc.sessionId);

      return (
        <div>
          <strong>Cleaner</strong>
          <div>{loc.name || 'Cleaner'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline"
              onClick={() => viewCleanerProfile(loc.uid || loc.sessionId)}
            >
              View Cleaner Profile
            </button>

            <button
              className={`btn btn-primary ${hasActiveRequest ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (!hasActiveRequest) requestCleaner(loc.uid || loc.sessionId);
              }}
              disabled={hasActiveRequest}
            >
              {hasActiveRequest ? 'Requested' : 'Request'}
            </button>
          </div>
        </div>
      );
    }

    if (userRole === 'cleaner' && loc.role === 'customer') {
      return (
        <div>
          <strong>Customer</strong>
          <div>{loc.name || 'Customer'}</div>
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-success"
              onClick={() => {
                setIncomingRequest(null);
                showToast('Tap Accept in the incoming request panel.', 'info');
              }}
            >
              View Request
            </button>
          </div>
        </div>
      );
    }

    return <div><strong>{loc.role}</strong></div>;
  }

  /* -----------------------------
     UI helpers
     ----------------------------- */
  const toggleSharing = async () => {
    if (sharing) {
      if (sessionId) {
        await rtdbRemove(rtdbRef(database, `locations/${sessionId}`)).catch(() => {});
      }
      setSharing(false);
      setIsAvailable(false);
    } else {
      setSharing(true);
      setIsAvailable(true);
    }
  };

  const openProfileModal = () => setShowProfileModal(true);

  const renderStars = (avg) => {
    const n = Math.round(avg);
    const filled = '★'.repeat(n);
    const empty = '☆'.repeat(5 - n);
    return (
      <span style={{ color: '#f59e0b', fontSize: 16 }}>
        {filled}{empty}
      </span>
    );
  };

  /* -----------------------------
     Realtime messages listener (instant delivery)
     - listens to same conversation subcollection used by ChatBox
     ----------------------------- */
     
  useEffect(() => {

    // HARD GATE: wait for auth + role
    if (!user?.uid || !userRole) {
      console.log('[ChatListener] skipped — user or role not ready');
      return;
    }

    console.log('[ChatListener] attached for', safeUid, userRole);

    const conversationsRef = collectionGroup(db, "messages");
    const q = query(conversationsRef, orderBy("timestamp", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;

      const latest = snapshot.docs[0].data();

      // message must be TO this user and FROM someone else
      if (
        latest.recipientId === safeUid &&
        latest.senderId !== safeUid      ) {
        console.log('[ChatListener] Incoming message');

        setIncomingMessage({
          text: latest.text,
          senderId: latest.senderId,
          conversationId: latest.conversationId || null,
        });

        // IMPORTANT: DO NOT auto-open chat before role context exists
        // setChatWith((prev) => prev ?? latest.senderId);

        setUnreadMessages((prev) => ({
          ...prev,
          [latest.senderId]: true,
        }));
      }
    });

    return () => {
      console.log('[ChatListener] detached');
      unsub();
    };
  }, [user?.uid, userRole]);



  // Responsive grid: switch to single-column layout on mobile
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = windowWidth < 768;
  const effectiveChatWidth = isMobile ? 0 : (chatWith ? 320 : 0);

  const mainGridStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : `380px 1fr ${effectiveChatWidth}px`,
    gap: '1rem',
    width: isMobile ? '98%' : '95%',
    height: isMobile ? 'auto' : '750px',
    margin: isMobile ? '0.5rem auto' : '1rem auto',
    transition: 'grid-template-columns 0.30s ease',
  };

  /* -----------------------------
     Main render
     ----------------------------- */
  return (
    <div className="App m-0 bg-black-50">

      {/* TOAST NOTIFICATION */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'info' })}
      />

      {/* MAIN LAYOUT GRID */}
      <div style={mainGridStyle}>

        {/* LEFT PANEL */}
        <div className="max-height: 97vh space-y-4 relative">

          {/* SESSION BOX */}
          <div className="p-4 bg-white rounded shadow">
            <h2 className="text-lg font-semibold">Session</h2>
            {!userRole && showRoleModal && (
              <div className="mt-4">
                <p className="mb-2">Who are you?</p>
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-gray-200 rounded"
                          onClick={() => handleRoleSelect('viewer')}>
                    Viewer
                  </button>
                  <button className="px-3 py-2 bg-green-500 text-white rounded"
                          onClick={() => handleRoleSelect('cleaner')}>
                    Cleaner
                  </button>
                  <button className="px-3 py-2 bg-blue-500 text-white rounded"
                          onClick={() => handleRoleSelect('customer')}>
                    Customer
                  </button>
                </div>  
              </div>
            )}

            <div className="mt-4">
              <button
                className="px-3 py-2 bg-indigo-600 text-white rounded"
                onClick={toggleSharing}
              >
                {sharing ? 'Stop Sharing' : 'Start Sharing'}
              </button>

              <button
                className="ml-2 px-3 py-2 bg-white border rounded relative"
                onClick={openProfileModal}
              >
                Profile
                {showProfileDot && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <div>Role: <strong>{userRole || '—'}</strong></div>
              <div>
                Availability:{' '}
                <strong>
                  {userRole === 'cleaner'
                    ? (activeJob
                        ? 'On Job'
                        : (isAvailable ? 'Online' : 'Offline'))
                    : (userRole === 'customer'
                        ? (sharing ? 'Online' : 'Offline')
                        : '-')}
                </strong>
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS */}
        {userRole && (
          <div className="p-4 bg-white rounded shadow space-y-2">
            <h3 className="font-semibold">Notifications</h3>

            {customerNotice && (
              <div className={`p-3 rounded ${
                customerNotice.type === 'error' ? 'bg-red-50'
                : customerNotice.type === 'success' ? 'bg-green-50'
                : 'bg-blue-50'
              }`}>
                <strong>{customerNotice.title}</strong>
                <div>{customerNotice.body}</div>
                <div className="mt-2">
                  <button
                    onClick={() => setCustomerNotice(null)}
                    className="px-2 py-1 bg-gray-200 rounded"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {incomingMessage && (
              <div className="p-2 bg-yellow-50 rounded">
                <div><strong>Message:</strong> {incomingMessage.text}</div>
                <div className="mt-2 text-xs text-gray-500">New chat message received.</div>
                <div className="mt-2">
                  <button
                    onClick={() => setIncomingMessage(null)}
                    className="px-2 py-1 bg-gray-200 rounded"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* ACTIVE JOB PANEL */}
            {activeJob ? (
              userRole === 'cleaner' ? (
                <div className="p-2 border rounded">
                  <div className="font-semibold">Job active</div>
                  <div>Customer: {activeJob.customerName || activeJob.customerUid}</div>
                  <div>Booking: {activeJob.bookingId}</div>
                  <div className="mt-2 flex gap-2">

                    <button
                      className="px-2 py-1 bg-blue-500 text-white rounded"
                      onClick={handleTrackCustomer}
                      disabled={isProcessing}
                    >
                      Track Customer
                    </button>

                    <button
                      className="px-2 py-1 bg-green-500 text-white rounded"
                      onClick={finishJob}
                      disabled={isProcessing}
                    >
                      Finish Job
                    </button>

                    <button
                      className="px-2 py-1 bg-red-500 text-white rounded"
                      onClick={() => cancelActiveJob('cancelled_by_cleaner')}
                      disabled={isProcessing}
                    >
                      Cancel
                    </button>

                    {/* CHAT */}
                    <button
                      className="px-2 py-1 bg-indigo-600 text-white rounded"
                      onClick={() => {
                        const target = activeJob.customerUid;
                        if (!target) { showToast('Chat target missing', 'error'); return; }
                        setChatWith(target);
                      }}
                    >
                      Chat
                    </button>
                  </div>
                </div>
              
              ) : null
            ) : incomingRequest && userRole === 'cleaner' ? (
              // Cleaner sees incoming request
              <div className="p-2 border rounded">
                <div className="font-semibold">Incoming Request</div>
                <div>From: {incomingRequest.customerName || incomingRequest.fromName || incomingRequest.from}</div>
                <div className="mt-2 flex gap-2">

                  <button
                    className="px-2 py-1 bg-blue-500 text-white rounded"
                    onClick={handleTrackCustomer}
                  >
                    Track
                  </button>

                  <button
                    className="px-2 py-1 bg-green-500 text-white rounded"
                    onClick={acceptRequest}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Accepting...' : 'Accept'}
                  </button>

                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    disabled={isProcessing}
                    onClick={async () => {
                      await rtdbSet(
                        rtdbRef(database, `requests/${safeUid}`),
                        { ...incomingRequest, status: 'rejected' }
                      );
                      setIncomingRequest(null);
                    }}
                  >
                    Reject
                  </button>

                </div>
              </div>
            ) : null}


            {/* CUSTOMER REQUEST PANEL */}
            {currentCustomerRequest &&
             userRole === 'customer' &&
             currentCustomerRequest.status !== 'paid' && (
              <div className="p-2 border rounded">
                <div>
                  <strong>Your request is:</strong>{' '}
                  {currentCustomerRequest.status}
                </div>

                <div className="mt-2 flex gap-2">

                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    onClick={cancelCustomerRequest}
                  >
                    Cancel Request
                  </button>

                  {(currentCustomerRequest.status === 'accepted' ||
                    activeJob) && (
                    <button
                      className="px-2 py-1 bg-indigo-600 text-white rounded"
                      onClick={() => {
                        const target =
                          currentCustomerRequest.cleanerUid ||
                          activeJob?.cleanerUid;
                        if (!target) {
                          showToast('Cleaner not ready for chat.', 'error');
                          return;
                        }
                        setChatWith(target);
                      }}
                    >
                      Chat
                    </button>
                  )}

                </div>
              </div>
            )}

            {/* CLEANER PROFILE MODAL (always available) */}
            {showCleanerProfilePanel && (
              <div className="bg-blue-100 p-4 mt-3 rounded shadow w-full max-w-md">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-l font-semibold">
                    {cleanerProfile ? cleanerProfile.name : 'Loading...'}
                  </h3>
                  <button
                    onClick={() => setShowCleanerProfilePanel(false)}
                    className="px-2 py-1 text-gray-600 hover:text-gray-800"
                  >
                    Close
                  </button>
                </div>

                {/* Role */}
                {cleanerProfile && (
                  <p className="text-sm font-medium text-indigo-400 mb-2">
                    Cleaner Category:
                    <span className="ml-2 text-sm text-gray-700 font-medium">
                      {cleanerProfile.category}
                    </span>
                  </p>
                )}


                {/* Ratings */}
                {cleanerProfile ? (
                  <div className="flex items-center mb-2">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const starValue = i + 1;
                      if (cleanerProfile.avgRating >= starValue) {
                        return <span key={i} className="text-yellow-400 text-xl">★</span>;
                      } else if (cleanerProfile.avgRating >= starValue - 0.5) {
                        return <span key={i} className="text-yellow-400 text-xl">⯨</span>; // half star fallback
                      } else {
                        return <span key={i} className="text-gray-300 text-xl">★</span>;
                      }
                    })}
                    <span className="ml-2 text-gray-700 font-medium">
                      {cleanerProfile.avgRating.toFixed(1)} ({cleanerProfile.ratingCount})
                    </span>
                  </div>
                ) : (
                  <p>Loading ratings...</p>
                )}

                {/* Completed Jobs */}
                {cleanerProfile && (
                  <p className="text-sm text-gray-600">
                    Completed Jobs: {cleanerProfile.completedJobs}
                  </p>
                )}

                {/* Bio */}
                {cleanerProfile?.bio && <p className="mt-2 text-gray-700">{cleanerProfile.bio}</p>}
              </div>
            )}
            
          
          </div>
        )}
        </div>

        {/* CENTER MAP */}
        <div className="bg-white rounded h-[100%] shadow p-2">
          <h2 className="text-lg font-semibold mb-2">Map</h2>

          <div style={{ height: isMobile ? '60vh' : '80vh' }} className="rounded overflow-hidden">
            <MapContainer
              center={[0, 0]}
              zoom={2}
              className="h-full w-full"
            >
              {(targetCoords || currentCoords) && (
                <RecenterMap
                  coords={targetCoords || currentCoords}
                  trigger={recenterTrigger}
                />
              )}

              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              {/* AUTO MANUAL ROUTE */}
              {isTrackingTarget && currentCoords && targetCoords && (
                <ManualRoute
                  from={{ lat: currentCoords.lat, lng: currentCoords.lng }}
                  to={targetCoords}
                />
              )}



              {/* SELF MARKER */}
              {currentCoords && (
                <Marker
                  position={[currentCoords.lat, currentCoords.lng]}
                  icon={userMarkerIcon}
                >
                  <Popup>You (this device)</Popup>
                </Marker>
              )}

              {/* HARDCODED CLEANERS */}
              {hardcodedCleaners.map((c) => (
                <Marker
                  key={c.id}
                  position={[c.lat, c.lng]}
                  icon={createRoleIcon(
                    'https://img.icons8.com/ios-filled/50/000000/broom.png',
                    'cleaner'
                  )}
                >
                  <Popup>
                    <div>
                      <strong>Demo Cleaner: {c.id}</strong>
                      <div className="mt-2">
                        <button
                          className="px-2 py-1 bg-blue-500 text-white rounded"
                          onClick={() => {
                            setTargetCoords({ lat: c.lat, lng: c.lng });
                            setRecenterTrigger((t) => t + 1);
                          }}
                        >
                          Track This Cleaner
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* VISIBLE MARKERS */}
              {visibleMarkers.map(([id, loc]) => (
                <Marker
                  key={id}
                  position={[loc.lat, loc.lng]}
                  icon={createRoleIcon(
                    loc.role === 'cleaner'
                      ? 'https://img.icons8.com/ios-filled/50/000000/broom.png'
                      : 'https://img.icons8.com/ios-filled/50/000000/user.png',
                    loc.role
                  )}
                >
                  <Popup>{renderPopupContentJSX(loc)}</Popup>
                </Marker>
              ))}

            </MapContainer>
          </div>
        </div>

        {/* RIGHT CHAT PANEL (floating) */}
        
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          transition: 'background 0.25s ease'
        }}>
          
        {chatWith && user?.uid && userRole && (
            <ChatBox
              conversationId={generateConversationId(user.uid, chatWith)}
              recipientId={chatWith}
              onClose={() => setChatWith(null)}
              userRole={userRole}
              isMobile={isMobile}
              isOpen={Boolean(chatWith)}
            />
        )}
        </div>
      
      </div>

      {/* DASHBOARD MODAL */}
      {ShowDashboardModal && (
        <div className="fixed inset-0 bg-black/40 z-[10000]">
          <DashBoard
            user={user}
            role={userRole}
            onClose={() => setShowDashboardModal(false)}
          />
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Profile</h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-2 py-1"
              >
                Close
              </button>
            </div>

            <ProfileForm
              user={user}
              role={userRole}
              onClose={() => setShowProfileModal(false)}
            />
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-md relative">
            <h3 className="font-semibold">Payment</h3>
            <p className="text-sm text-gray-600">
              Enter the amount to pay the cleaner.
            </p>

            {!paymentReceipt && (
              <>
                <div className="mt-3">
                  <label className="block text-sm">Amount</label>
                  <input
                    type="text"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border p-2 rounded"
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    className="px-3 py-2 bg-green-600 text-white rounded"
                    onClick={submitPayment}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Submit Payment'}
                  </button>

                  <button
                    className="px-3 py-2 bg-gray-200 rounded"
                    onClick={() => setShowPaymentModal(false)}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {paymentReceipt && (
              <div className="mt-3 p-2 border rounded">
                <div><strong>Receipt ID:</strong> {paymentReceipt.id}</div>
                <div><strong>Amount:</strong> {paymentReceipt.amount}</div>

                <div className="mt-2 flex gap-2">

                  <button
                    className="px-3 py-2 bg-indigo-600 text-white rounded"
                    onClick={() => {
                      const cleanerName =
                        (ratingBookingContext &&
                        ratingBookingContext.cleanerId) ||
                        activeJob?.cleanerUid ||
                        currentCustomerRequest?.cleanerUid ||
                        'Cleaner';

                      const customerName = userName || 'Customer';

                      printReceipt(
                        paymentReceipt,
                        paymentBookingId || activeJob?.bookingId || currentRequestId,
                        cleanerName,
                        customerName
                      );
                    }}
                  >
                    Print Receipt
                  </button>

                  <button
                    className="px-3 py-2 bg-green-600 text-white rounded"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setShowRatingModal(true);
                    }}
                  >
                    Continue to Rating
                  </button>

                  <button
                    className="px-3 py-2 bg-gray-200 rounded"
                    onClick={() => setShowPaymentModal(false)}
                  >
                    Close
                  </button>

                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* RATING MODAL */}
      {showRatingModal && ratingBookingContext && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-md">
            <h3 className="font-semibold">Rate your Cleaner</h3>
            <p className="text-sm text-gray-600">1 (worst) - 5 (best)</p>

            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  className="px-3 py-2 bg-yellow-300 rounded"
                  onClick={() => submitRating(s, '')}
                >
                  {s}★
                </button>
              ))}
            </div>

            <div className="mt-3">
              <button
                className="px-3 py-2 bg-gray-200 rounded"
                onClick={() => setShowRatingModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
