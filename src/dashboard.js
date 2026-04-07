import { showToast } from './App';
// src/dashboard.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import ModalPanel from "./components/ModalPanel";
import lastWeekBookings from "./components/WeeklyBarGraph";
import lastWeekEarnings from "./components/WeeklyBarGraph";
import WeeklyBarGraph from "./components/WeeklyBarGraph";
import DataTable from "./components/CleanerTableModal";
import ReportsPanel from "./components/ReportsPanel";
import CleanerDetailModal from "./components/CleanerDetailModal";
import ReauthModal from "./components/ReauthModal";
import DeleteConfirmModal from "./components/DeleteConfirmModal";

import {
  collection,
  onSnapshot,
  doc,
  deleteDoc
} from "firebase/firestore";

// Map + RTDB imports for showing active cleaners
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { database, ref as rtdbRef, onValue } from './firebaseConfig';

import {
  getIncomePerCleaner,
  getRatingsPerCleaner,
  deleteIncomeForCleaner
} from "./services/reportService";

import { firestore as db, auth } from "./firebaseConfig";
import { updateBookingStatus } from "./services/bookingService";
import { updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { updateUser } from "./services/userService";
import { getAdminProfile, updateAdminProfile, findAdminProfileByAuthUid } from "./services/adminService";

// Icons (using MUI icons already in project)
import BookIcon from '@mui/icons-material/Book';
import PeopleIcon from '@mui/icons-material/People';
import PaidIcon from '@mui/icons-material/Paid';


/** ---------- Helpers ---------- */

// Convert Firestore Timestamp / millis / ISO string to JS Date safely
function toDateSafe(ts) {
  if (!ts) return null;
  if (ts.toDate && typeof ts.toDate === "function") {
    return ts.toDate();
  }
  // number (seconds?) or milliseconds
  if (typeof ts === "number") {
    // Heuristic: if seconds (10-digit), convert to ms
    return ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
  }
  // ISO string
  try {
    return new Date(ts);
  } catch {
    return null;
  }
}

// human readable time difference
function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// format currency KSH
function formatKsh(n) {
  if (n == null) return "Ksh 0";
  const v = Number(n) || 0;
  return `Ksh ${v.toLocaleString("en-KE")}`;
}

// human readable duration (ms)
function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${totalSec}s`;
}

// status icon
function statusIcon(s) {
  if (!s) return "";
  const st = s.toLowerCase();
  if (st === "closed" || st === "completed") return "✔️";
  if (st === "pending") return "⏳";
  if (st === "accepted" || st === "in-progress" || st === "working" || st === "onjob") return "🔄";
  return "ℹ️";
}

// Leaflet icon helper (small copy from App.js)
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

// Fit bounds helper component for maps
function FitBounds({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (!markers || markers.length === 0) return;
    try {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 12);
      } else {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (e) {
      console.warn('FitBounds failed', e);
    }
  }, [markers]);
  return null;
}



/** ---------- Component ---------- */

export default function DashboardLayout() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [activePanel, setActivePanel] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ensure detail modals are closed when changing active panel
  useEffect(() => {
    setSelectedCleaner(null);
    setSelectedBooking(null);
    setDeleteConfirmModal(null);
  }, [activePanel]);

  // raw collections
  const [usersMap, setUsersMap] = useState({}); // id -> user
  const [cleaners, setCleaners] = useState([]); // array of cleaner users
  const [bookings, setBookings] = useState([]); // array of bookings
  const [payments, setPayments] = useState([]); // array of payments (if needed)
  // realtime locations (from RTDB)
  const [locations, setLocations] = useState({});
  // audits feature removed per request
  

  // weekly stats
  const [weeklyBookings, setWeeklyBookings] = useState(new Array(7).fill(0));
  const [weeklyEarnings, setWeeklyEarnings] = useState(new Array(7).fill(0));



  // reports
  const [reports, setReports] = useState({
    incomePerCleaner: [],
    ratingsPerCleaner: []
  });
  const [reportFrom, setReportFrom] = useState(null);
  const [reportTo, setReportTo] = useState(null);


  // admin profile (fetched from users collection where role === 'admin')
  const [adminProfile, setAdminProfile] = useState(null);
  const [resolvedAdminUid, setResolvedAdminUid] = useState(null);

  // modal selection
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showAdminEdit, setShowAdminEdit] = useState(false);
  const [adminEditName, setAdminEditName] = useState('');
  const [adminEditEmail, setAdminEditEmail] = useState('');
  const [adminEditPassword, setAdminEditPassword] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);

  // resolvedAdminUid is the Firestore admin doc id we should load (may come from auth, meta.authUid, or localStorage)
  // We will resolve it in an effect below.
  // const adminUid = auth.currentUser?.uid;

  // secure re-auth modal state and a promise bridge to await user input
  const [reauthOpen, setReauthOpen] = useState(false);
  const reauthPromiseRef = useRef(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(null); // { collectionName, id, entityType }
  const requestReauth = (email) => new Promise((resolve, reject) => {
    reauthPromiseRef.current = { resolve, reject, email };
    setReauthOpen(true);
  });
  const handleReauthConfirm = (password) => {
    setReauthOpen(false);
    if (reauthPromiseRef.current) {
      reauthPromiseRef.current.resolve(password);
      reauthPromiseRef.current = null;
    }
  };
  const handleReauthCancel = () => {
    setReauthOpen(false);
    if (reauthPromiseRef.current) {
      reauthPromiseRef.current.reject(new Error('cancelled'));
      reauthPromiseRef.current = null;
    }
  };

  // protect admin route
  useEffect(() => {
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (!isAdmin) navigate("/");
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem("adminSessionActive", "true");
  }, []);

  // Redirect / Recovery: run unconditionally (hooks must be called in order)
  // If admin session is not active, redirect immediately; if session is active but we failed to resolve
  // the admin Firestore doc, attempt recovery using stored adminUid before redirecting.
  useEffect(() => {
    if (!loading && !resolvedAdminUid) {
      const isAdminFlag = localStorage.getItem('isAdmin') === 'true';
      if (!isAdminFlag) {
        if (typeof showToast === 'function') showToast('Admin profile not found. Please sign in again.', 'error');
        navigate('/');
        return;
      }

      // Session claims admin access but we couldn't resolve admin doc — attempt recovery using stored adminUid
      console.warn('Admin session active but no resolved admin doc. localStorage.adminUid=', localStorage.getItem('adminUid'));
      (async () => {
        const ls = localStorage.getItem('adminUid');
        if (ls) {
          try {
            const profile = await getAdminProfile(ls);
            if (profile) {
              setResolvedAdminUid(ls);
              setAdminProfile(profile);
              if (typeof showToast === 'function') showToast('Recovered admin profile from local storage', 'success');
              return;
            } else {
              console.warn('No profile found for stored adminUid', ls);
            }
          } catch (e) {
            console.error('Error fetching profile for stored adminUid', ls, e);
          }
        }
        if (typeof showToast === 'function') showToast('Admin session active but profile missing; contact support.', 'warning');
      })();
    }
  }, [loading, resolvedAdminUid, navigate]);

  /** ---------- realtime: users (all) ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      const cleanersList = [];
      let admin = null;
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        map[d.id] = data;
        const role = (data.role || '').toLowerCase();
        if (role === "cleaner") cleanersList.push(data);
        if (!admin && role === "admin") admin = data;
      });
      setUsersMap(map);
      setCleaners(cleanersList);
      if (admin) setAdminProfile(admin);
    });
    return unsub;
  }, []);

  /** ---------- realtime: bookings ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(list);
    });
    return unsub;
  }, []);

  /** ---------- realtime: payments (if present) ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "payments"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPayments(list);
    });
    return unsub;
  }, []);

  /** ---------- realtime: locations (RTDB) ---------- */
  useEffect(() => {
    try {
      const locRef = rtdbRef(database, 'locations');
      const unsub = onValue(locRef, (snap) => {
        const val = snap.val() || {};
        setLocations(val);
      });
      return () => unsub;
    } catch (e) {
      console.warn('Failed subscribe to locations', e);
    }
  }, []);



  /** ---------- weekly stats calculation (last 7 days) ---------- */
  useEffect(() => {
    // compute last 7-day window (including today)
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6); // 6 days before today => 7-day window

    const bookingsArr = new Array(7).fill(0);
    bookings.forEach((b) => {
      const d = toDateSafe(b.createdAt || b.created_at || b.timestamp);
      if (!d) return;
      if (d < start || d > now) return;
      const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24)); // 0..6
      if (diffDays >= 0 && diffDays < 7) bookingsArr[diffDays] += 1;
    });
    setWeeklyBookings(bookingsArr);

    const earningsArr = new Array(7).fill(0);
    // use payments if present, else use bookings.price on bookings with paid status
    if (payments && payments.length > 0) {
      payments.forEach((p) => {
        const d = toDateSafe(p.createdAt || p.created_at || p.timestamp);
        if (!d) return;
        if (d < start || d > now) return;
        const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) earningsArr[diffDays] += Number(p.amount || 0);
      });
    } else {
      bookings.forEach((b) => {
        const d = toDateSafe(b.createdAt || b.created_at || b.timestamp);
        if (!d) return;
        if (d < start || d > now) return;
        // treat completed/closed/paid bookings as revenue
        if (["closed", "completed", "paid"].includes(String(b.status).toLowerCase())) {
          const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays < 7) earningsArr[diffDays] += Number(b.amountPaid || 0);
        }
      });
    }
    setWeeklyEarnings(earningsArr);
  }, [bookings, payments]);

  /** ---------- Reports loader (on demand) ---------- */
  const formatDateForFilename = (d) => {
    if (!d) return 'ALL';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const refreshReports = async (from = reportFrom, to = reportTo) => {
    // accept Date objects or null
    const income = await getIncomePerCleaner(from, to);
    const ratings = await getRatingsPerCleaner(from, to);
    setReports({ incomePerCleaner: income, ratingsPerCleaner: ratings });
  };

  const applyPresetDays = async (days) => {
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    setReportFrom(from);
    setReportTo(to);
    await refreshReports(from, to);
  };

  const openReportsPanel = async () => {
    setActivePanel("reports");
    // default to last 30 days if no explicit range selected
    if (!reportFrom && !reportTo) {
      await applyPresetDays(30);
    } else {
      await refreshReports();
    }
  };

  const endAdminSession = () => {
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminSessionActive");
    navigate("/");
  };

  // generic delete helper
  const handleDeleteDoc = async (collectionName, id) => {
    const entityType = collectionName === 'users' ? 'Cleaner' : 'Booking';
    setDeleteConfirmModal({ collectionName, id, entityType });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmModal) return;
    const { collectionName, id, entityType } = deleteConfirmModal;
    
    try {
      await deleteDoc(doc(db, collectionName, id));
      if (typeof showToast === 'function') showToast(`${entityType} deleted successfully`, 'success');
      setDeleteConfirmModal(null);
    } catch (err) {
      if (typeof showToast === 'function') showToast('Delete failed. Please try again.', 'error');
      setDeleteConfirmModal(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmModal(null);
  };

  // Columns for CleanerTableModal (kept simple)
  const cleanerColumns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "rating", label: "Rating" },
    { key: "categories", label: "Categories" }
  ];

  const bookingColumns = [
    { key: "bookingId", label: "Booking ID", cellClass: 'whitespace-nowrap font-mono text-sm' },
    { key: "customerName", label: "Customer" },
    { key: "cleanerName", label: "Cleaner" },
    { key: "price", label: "Price", cellClass: 'whitespace-nowrap text-right' },
    { key: "status", label: "Status", cellClass: 'whitespace-nowrap' },
    { key: "timeTaken", label: "Time Taken" }
  ];

  /** ---------- Derived panels data ---------- */

  // find bookings with created date; sort descending by date
  const bookingsWithDate = useMemo(() => {
    return bookings
      .map((b) => {
        const d = toDateSafe(b.createdAt || b.created_at || b.timestamp);
        return { ...b, __date: d };
      })
      .sort((a, b) => {
        const da = a.__date ? a.__date.getTime() : 0;
        const db = b.__date ? b.__date.getTime() : 0;
        return db - da;
      });
  }, [bookings]);

  // 1) Last 3 completed jobs: status === "closed"
  const completedJobs = bookingsWithDate.filter((b) => String(b.status).toLowerCase() === "closed").slice(0, 3);

  // 2) Next 3 active jobs: pending, accepted, in-progress, working, onjob
  const activeJobs = bookingsWithDate.filter((b) => {
    const st = String(b.status || "").toLowerCase();
    return ["pending", "accepted", "in-progress", "working", "onjob"].includes(st);
  }).slice(0, 3);

  // 3) Top 3 rated cleaners: derived from ratings collection (we'll compute locally from usersMap and bookings)
  // We'll compute ratings by scanning reports.ratingsPerCleaner (if available) else fallback to usersMap rating field
  const topCleaners = useMemo(() => {
    // try reports.ratingsPerCleaner first (structure {cleanerId, average, count})
    if (reports.ratingsPerCleaner && reports.ratingsPerCleaner.length > 0) {
      const arr = reports.ratingsPerCleaner
        .map((r) => {
          const user = usersMap[r.cleanerId] || {};
          const jobsCompleted = bookings.filter((b) => String(b.cleanerId) === String(r.cleanerId) && String(b.status).toLowerCase() === "closed").length;
          return {
            id: r.cleanerId,
            name: user.name || user.fullName || user.email || r.cleanerId,
            average: r.average || 0,
            count: r.count || 0,
            jobsCompleted
          };
        })
        .sort((a, b) => b.average - a.average)
        .slice(0, 3);
      return arr;
    }

    // fallback: use usersMap rating field
    const fallback = Object.values(usersMap)
      .filter(u => (u.role || '').toLowerCase() === 'cleaner')
      .map(u => {
        const jobsCompleted = u.completedJobs ??
          bookings.filter(
            b =>
              String(b.cleanerId) === String(u.uid || u.id) &&
              String(b.status).toLowerCase() === 'closed'
          ).length;

        return {
          id: u.uid || u.id,
          name: u.name || u.email || u.id,
          average: Number(u.averageRating || 0),
          count: Number(u.ratingCount || 0),
          jobsCompleted
        };
      })
      .filter(c => c.count > 0)
      .sort((a, b) => b.average - a.average)
      .slice(0, 3);

    return fallback;
  }, [reports.ratingsPerCleaner, usersMap, bookings]);

  // helper to get user name by id
  const getUserName = (id) => {
    const u = usersMap[id];
    if (!u) return id || "Unknown";
    return u.name || u.fullName || u.email || id;
  };

  // helper to normalize cleaner for detail view modal
  const normalizeCleanerForView = (u) => {
    const cleanerId = u.uid || u.id;

    const completedJobs =
      Number(u.completedJobs) ||
      bookings.filter(
        b =>
          String(b.cleanerId) === String(cleanerId) &&
          String(b.status).toLowerCase() === "closed"
      ).length;

    const totalEarnings = calculateCleanerEarnings(cleanerId);

    return {
      id: cleanerId,
      name: u.name || u.meta?.name || u.email || "—",
      email: u.email || "—",
      phone: u.phone || "—",
      status: u.status || "—",

      averageRating: Number(u.averageRating || 0),
      ratingCount: Number(u.ratingCount || 0),

      categories: Array.isArray(u.categories)
        ? u.categories
        : u.category
          ? [u.category]
          : [],

      completedJobs,
      totalEarnings,
    };
  };


  // helper to calculate total earnings for a cleaner from payments collection
  const calculateCleanerEarnings = (cleanerId) => {
    if (!cleanerId) return 0;

    // Map bookingId → cleanerId
    const bookingCleanerMap = {};
    bookings.forEach(b => {
      if (b.id && b.cleanerId) {
        bookingCleanerMap[b.id] = b.cleanerId;
      }
    });

    return payments.reduce((sum, p) => {
      if (!p || !p.bookingId) return sum;

      const paidCleanerId = p.payeeId || bookingCleanerMap[p.bookingId];

      if (String(paidCleanerId) !== String(cleanerId)) return sum;

      const amount = Number(p.amount);
      if (isNaN(amount)) return sum;

      return sum + amount;
    }, 0);
  };


  // table-ready derived data
  const cleanersTableData = useMemo(() => {
    const source = (cleaners && cleaners.length) ? cleaners : Object.values(usersMap).filter(u => (u.role || '').toLowerCase().includes('cleaner'));
    return source.map((u) => ({
      id: u.id,
      name: u.name || u.fullName || u.email || u.id,
      email: u.email || "",
      phone: u.phone || "",
      rating: ((u.averageRating ?? u.rating ?? 0).toFixed(1)),  // ✅ one decimal
      categories: u.categories && u.categories.length ? u.categories.join(", ") : (u.category || "Not specified")
    }));
  }, [cleaners, usersMap]);

  const bookingsTableData = useMemo(() => {
    return bookings.map((b) => {
      const created = toDateSafe(b.createdAt);
      const closed = toDateSafe(b.closedAt || b.completedAt);
      const timeTaken =
        created && closed
          ? formatDuration(closed.getTime() - created.getTime())
          : '—';


      // Try to find final price: booking.price else payments for booking
      let finalPrice =
        b.price != null && Number(b.price) > 0
          ? Number(b.price)
          : null;

      // fallback 1: paidAmount on booking itself
      if (finalPrice == null && b.paidAmount != null) {
        const paid = Number(b.paidAmount);
        if (!isNaN(paid) && paid > 0) {
          finalPrice = paid;
        }
      }

      // fallback 2: payments collection
      if (finalPrice == null && payments?.length) {
        const bookPayments = payments.filter(
          p =>
            String(p.bookingId) === String(b.id) ||
            String(p.bookingId) === String(b.bookingId)
        );
        if (bookPayments.length) {
          finalPrice = bookPayments.reduce(
            (s, p) => s + Number(p.amount || 0),
            0
          );
        }
      }

      if (finalPrice == null && payments && payments.length) {
        const bookPayments = payments.filter(p => String(p.bookingId) === String(b.id) || String(p.bookingId) === String(b.bookingId));
        if (bookPayments.length) {
          finalPrice = bookPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        }
      }

      return {
        id: b.id,
        bookingId: b.bookingId || b.id,

        customerId: b.customerId,
        cleanerId: b.cleanerId,

        customerName:
          (usersMap[b.customerId] &&
            (usersMap[b.customerId].name ||
              usersMap[b.customerId].fullName ||
              usersMap[b.customerId].email)) ||
          b.customerName ||
          b.customerId,

        cleanerName:
          (usersMap[b.cleanerId] &&
            (usersMap[b.cleanerId].name ||
              usersMap[b.cleanerId].fullName ||
              usersMap[b.cleanerId].email)) ||
          b.cleanerName ||
          b.cleanerId,

        // 🔥 PRICE FIX
        price:
          finalPrice != null && !isNaN(finalPrice) && finalPrice > 0
            ? finalPrice
            : Number(b.paidAmount || 0),

        serviceType: b.serviceType || '—',
        
        // ⌚ TIMESTAMPS
        createdAt: toDateSafe(b.createdAt),
        closedAt: toDateSafe(b.closedAt || b.completedAt),


        status: b.status,
        timeTaken
      };

      
    });
  }, [bookings, usersMap, payments]);

  // deduplicate RTDB locations by uid, keep latest timestamp
  const dedupedLocations = useMemo(() => {
    const map = {};
    Object.entries(locations || {}).forEach(([key, loc]) => {
      if (!loc || !loc.uid || !loc.lat || !loc.lng) return;
      const cur = map[loc.uid];
      const ts = loc.timestamp || loc.updatedAt || 0;
      if (!cur || (ts > (cur.timestamp || cur.updatedAt || 0))) {
        map[loc.uid] = { ...loc, sessionKey: key };
      }
    });
    return Object.values(map);
  }, [locations]);

  const cleanerMarkers = useMemo(() => {
    return dedupedLocations.filter(l => String(l.role).toLowerCase() === 'cleaner' && l.lat && l.lng);
  }, [dedupedLocations]);



  // admin profile display values (fetched from users collection where role === 'admin')
    // Resolve which admin Firestore doc to load: prefer a profile that maps to the current auth.uid,
  // else fall back to previously stored adminUid in localStorage (legacy username login uses this).
  useEffect(() => {
    let cancelled = false;

    const resolveAdminDoc = async () => {
      try {
        const current = auth.currentUser;
        if (current) {
          // Try direct match with auth UID
          let profile = await getAdminProfile(current.uid);
          // Try to find a doc that has meta.authUid === current.uid
          if (!profile) {
            try {
              profile = await findAdminProfileByAuthUid(current.uid);
            } catch (e) {
              console.warn('findAdminProfileByAuthUid failed', e);
            }
          }

          if (profile) {
            localStorage.setItem('adminUid', profile.id);
            if (!cancelled) setResolvedAdminUid(profile.id);
            return;
          }
        }

        // fallback to previously stored admin doc id (legacy username login uses this)
        const ls = localStorage.getItem('adminUid');
        if (ls) {
          if (!cancelled) setResolvedAdminUid(ls);
          return;
        }

        if (!cancelled) setResolvedAdminUid(null);
      } catch (error) {
        console.error('Error resolving admin doc:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resolveAdminDoc();

    return () => { cancelled = true; };
  }, [auth.currentUser]);

  // When resolvedAdminUid changes, fetch the profile doc
  useEffect(() => {
    if (!resolvedAdminUid) return;
    setLoading(true);

    const fetchProfile = async () => {
      try {
        const profile = await getAdminProfile(resolvedAdminUid);
        setAdminProfile(profile);
      } catch (error) {
        console.error("Error fetching admin profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [resolvedAdminUid]);

    // Show loading while we are resolving the admin profile — this avoids render-time crashes
    if (loading || !adminProfile) return <p className="text-center mt-4">Dashboard Opening...</p>;


  /** ---------- Render ---------- */
  // Compute a short initial for the avatar (fallback to 'A')
  const adminInitial = adminProfile?.username ? adminProfile.username.trim().charAt(0).toUpperCase() : 'A';

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* SIDEBAR (hidden on small screens) */}
      <aside className="hidden md:flex w-64 bg-white shadow-lg p-6 flex-col gap-6 sticky top-0 h-screen">
        <div className="bg-white p-4 rounded-2xl shadow w-full max-w-sm mx-auto text-center">
          {/* Header */}
          <div className="w-16 h-16 rounded-full bg-gray-400 mx-auto flex items-center justify-center mb-3 text-xl font-semibold text-gray-700 overflow-hidden">
            {adminProfile?.meta?.photoURL ? (
              <img src={adminProfile.meta.photoURL} alt="Admin avatar" className="w-full h-full object-cover" />
            ) : (
              <span>{adminInitial}</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-800">{adminProfile?.username || 'Admin'}</h2>
          <p className="text-sm text-gray-500 mb-4">{adminProfile?.meta?.email || "No email set"}</p>

          {/* Actions */}
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setShowAdminEdit(true)}
              className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition"
            >
              Edit Profile
            </button>
            <button
              onClick={endAdminSession}
              className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition"
            >
              Logout
            </button>
          </div>
        </div>
      
    


        <nav className="flex flex-col gap-3 text-gray-700">
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("dashboard")}>Dashboard</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("cleaners")}>Cleaners</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("bookings")}>Bookings</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("maps")}>Maps</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={openReportsPanel}>Reports</button>
        </nav>
      </aside>

      {/* MOBILE MENU: hamburger and overlay */}
      {/* we render mobile controls in the main panel (md:hidden) */}

      {/* RIGHT PANEL */}
      <main className="flex-1 p-8 flex flex-col gap-8">
        {/* MOBILE HEADER (hamburger) */}
        <div className="md:hidden flex items-center justify-between mb-4">
          <button onClick={() => setMobileMenuOpen(m => !m)} aria-label="Toggle menu" className="p-2 rounded-md bg-white shadow">
            ☰
          </button>
          <h2 className="text-lg font-semibold">Admin</h2>
        </div>

        {/* MOBILE MENU OVERLAY */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-20 left-4 right-4 bg-white rounded shadow-lg z-50 p-4">
            <nav className="flex flex-col gap-3 text-gray-700">
              <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => { setActivePanel('dashboard'); setMobileMenuOpen(false); }}>Dashboard</button>
              <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => { setActivePanel('cleaners'); setMobileMenuOpen(false); }}>Cleaners</button>
              <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => { setActivePanel('bookings'); setMobileMenuOpen(false); }}>Bookings</button>
              <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => { setActivePanel('maps'); setMobileMenuOpen(false); }}>Maps</button>
              <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => { openReportsPanel(); setMobileMenuOpen(false); }}>Reports</button>
              <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => { setActivePanel('conversations'); setMobileMenuOpen(false); }}>Conversations</button>
            </nav>
            <div className="mt-3 text-right">
              <button onClick={() => setMobileMenuOpen(false)} className="px-3 py-1 text-sm">Close</button>
            </div>
          </div>
        )}
        {/* CLEANER DETAIL */}
        {selectedCleaner && (
          <ModalPanel title="Cleaner Details" onClose={() => setSelectedCleaner(null)}>
            <CleanerDetailModal cleaner={selectedCleaner} onClose={() => setSelectedCleaner(null)} />
          </ModalPanel>
        )}

        {/* Dashboard */}
        {activePanel === "dashboard" && (
          <>
            {/* Top 3 modern stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-4 rounded-2xl shadow flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <BookIcon fontSize="small" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Bookings</div>
                    <div className="text-2xl font-bold">{bookings.length}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-500 text-right">
                  <div>Avg / day</div>
                  <div className="text-lg font-semibold">{(weeklyBookings.reduce((a,b)=>a+Number(b||0),0)/7).toFixed(1)}</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl shadow flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                    <PeopleIcon fontSize="small" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Cleaners</div>
                    <div className="text-2xl font-bold">{cleaners.length}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-500 text-right">
                  <div>Avg daily income</div>
                  <div className="text-lg font-semibold">{(weeklyEarnings.reduce((a,b)=>a+Number(b||0),0)/7).toFixed(0)}</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl shadow flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                  <PaidIcon fontSize="small" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Weekly Revenue</div>
                  <div className="text-2xl font-bold">{weeklyEarnings.reduce((a, b) => a + Number(b || 0), 0).toFixed(0)}</div>
                </div>
              </div>
            </div>

            {/* RECTANGLES - dynamic panels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Completed Jobs */}
              <div className="bg-white p-4 rounded-2xl shadow h-48 overflow-auto">
                <h3 className="text-md font-semibold mb-3">Recent Completed Jobs</h3>
                {completedJobs.length === 0 && <p className="text-gray-400 text-sm">No completed jobs yet</p>}
                {completedJobs.map((job) => {
                  const cleanerName = getUserName(job.cleanerId);
                  const date = toDateSafe(job.createdAt || job.created_at || job.timestamp);
                  return (
                    <div key={job.id} className="flex items-center justify-between border-b py-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{cleanerName}</div>
                        <div className="text-xs text-gray-500">{timeAgo(date)} ago</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatKsh(job.paidAmount)}</div>
                        <div className="text-xs text-gray-500">{statusIcon(job.status)} {job.status}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Jobs */}
              <div className="bg-white p-4 rounded-2xl shadow h-48 overflow-auto">
                <h3 className="text-md font-semibold mb-3">Active Jobs</h3>
                {activeJobs.length === 0 && <p className="text-gray-400 text-sm">No active jobs at the moment</p>}
                {activeJobs.map((job) => {
                  const cleanerName = getUserName(job.cleanerId);
                  const customerName = getUserName(job.customerId);
                  const date = toDateSafe(job.createdAt || job.created_at || job.timestamp);
                  return (
                    <div key={job.id} className="flex items-center justify-between border-b py-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{cleanerName} • {customerName}</div>
                        <div className="text-xs text-gray-500">{timeAgo(date)} ago</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatKsh(job.price)}</div>
                        <div className="text-xs text-gray-500">{statusIcon(job.status)} {job.status}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Top Rated Cleaners */}
              <div className="bg-white p-4 rounded-2xl shadow h-48 overflow-auto">
                <h3 className="text-md font-semibold mb-3">Top Rated Cleaners</h3>
                {topCleaners.length === 0 && <p className="text-gray-400 text-sm">Not enough rating data yet</p>}
                {topCleaners.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b py-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.count} ratings</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {(Number(c.average || 0)).toFixed(1)} ⭐
                      </div>

                      <div className="text-xs text-gray-500">{c.jobsCompleted} jobs</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* WEEKLY DASHBOARD GRAPHS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <WeeklyBarGraph
                title="Customers Served"
                thisWeek={weeklyBookings}
                lastWeek={lastWeekBookings}
              />

              <WeeklyBarGraph
                title="Money Earned"
                thisWeek={weeklyEarnings}
                lastWeek={lastWeekEarnings}
              />
            </div>
          </>
        )}

        {/* CLEANERS panel */}
        {activePanel === "cleaners" && (
          <ModalPanel title="Cleaners" onClose={() => setActivePanel("dashboard")}>
            <DataTable
              columns={cleanerColumns}
              data={cleanersTableData}
              onDelete={(id) => handleDeleteDoc("users", id)}
              onEdit={(row) => {
                const fullCleaner = usersMap[row.id];
                if (!fullCleaner) return;
                setSelectedCleaner(normalizeCleanerForView(fullCleaner));
              }}

              exportFilename="cleaners.csv"
            />
          </ModalPanel>
        )} 



        {/* BOOKINGS panel */}
        {selectedBooking && (
          <ModalPanel title="Booking Details" onClose={() => setSelectedBooking(null)}>
            <div className="p-4">
              <div className="mb-2"><b>Booking ID:</b> {selectedBooking.bookingId || selectedBooking.id}</div>
              <div className="mb-2"><b>Customer:</b> {selectedBooking.customerName}</div>
              <div className="mb-2"><b>Customer Phone:</b> {(usersMap[selectedBooking.customerId] && usersMap[selectedBooking.customerId].phone) || '—'}</div>
              <div className="mb-2"><b>Cleaner:</b> {selectedBooking.cleanerName}</div>
              <div className="mb-2"><b>Cleaner Phone:</b> {(usersMap[selectedBooking.cleanerId] && usersMap[selectedBooking.cleanerId].phone) || '—'}</div>
              <div className="mb-2"><b>Service:</b> {selectedBooking.serviceType || '—'}</div>
              <div className="mb-2">
                <b>Categories:</b>{' '}
                {Array.isArray(usersMap[selectedBooking.cleanerId]?.categories)
                  ? usersMap[selectedBooking.cleanerId].categories.join(', ')
                  : '—'}
              </div>
              <div className="mb-2"><b>Price:</b> {formatKsh(selectedBooking.price)}</div>
              <div className="mb-2"><b>Status:</b> {selectedBooking.status}</div>
              <div className="mb-2"><b>Time Taken:</b> {selectedBooking.timeTaken}</div>
              <div className="mb-2">
                <b>Requested At:</b>{" "}
                {selectedBooking.createdAt
                  ? toDateSafe(selectedBooking.createdAt)?.toLocaleString()
                  : "—"}
              </div>
              <div className="mb-2"><b>Completed At:</b> {(selectedBooking.closedAt || selectedBooking.completedAt || selectedBooking.closed_at || selectedBooking.completed_at) ? toDateSafe(selectedBooking.closedAt || selectedBooking.closed_at || selectedBooking.completedAt || selectedBooking.completed_at).toLocaleString() : '—'}</div>

              <div className="mt-4 flex gap-2">
                <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => {
                  // Simple Booking Details print (not a customer payment receipt)
                  const win = window.open('', '_blank');
                  const requested = selectedBooking.createdAt ? toDateSafe(selectedBooking.createdAt).toLocaleString() : '—';
                  const closed = (selectedBooking.closedAt || selectedBooking.closed_at || selectedBooking.completedAt || selectedBooking.completed_at) ? toDateSafe(selectedBooking.closedAt || selectedBooking.closed_at || selectedBooking.completedAt || selectedBooking.completed_at).toLocaleString() : '—';
                  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Booking Details</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111} h2{margin-bottom:6px} table{width:100%;border-collapse:collapse} td{padding:6px;border-bottom:1px solid #eee}</style></head><body><h2>Booking Details</h2><table><tr><td><strong>Booking ID</strong></td><td>${selectedBooking.bookingId || selectedBooking.id}</td></tr><tr><td><strong>Customer</strong></td><td>${selectedBooking.customerName}</td></tr><tr><td><strong>Customer Phone</strong></td><td>${(usersMap[selectedBooking.customerId] && usersMap[selectedBooking.customerId].phone) || '—'}</td></tr><tr><td><strong>Cleaner</strong></td><td>${selectedBooking.cleanerName}</td></tr><tr><td><strong>Cleaner Phone</strong></td><td>${(usersMap[selectedBooking.cleanerId] && usersMap[selectedBooking.cleanerId].phone) || '—'}</td></tr><tr><td><strong>Service</strong></td><td>${selectedBooking.serviceType || '—'}</td></tr><tr><td><strong>Categories</strong></td><td>${(usersMap[selectedBooking.cleanerId] && usersMap[selectedBooking.cleanerId].categories && usersMap[selectedBooking.cleanerId].categories.join(', ')) || '—'}</td></tr><tr><td><strong>Price</strong></td><td>${formatKsh(selectedBooking.price)}</td></tr><tr><td><strong>Status</strong></td><td>${selectedBooking.status}</td></tr><tr><td><strong>Requested At</strong></td><td>${requested}</td></tr><tr><td><strong>Completed At</strong></td><td>${closed}</td></tr><tr><td><strong>Time Taken</strong></td><td>${selectedBooking.timeTaken}</td></tr></table></body></html>`;
                  win.document.write(html);
                  win.print();
                  win.close();
                }}>Print</button>
              </div>
            </div>
          </ModalPanel>
        )}



        {/* BOOKINGS panel */}
        {activePanel === "bookings" && (
          <ModalPanel title="Bookings" onClose={() => setActivePanel("dashboard")}>
            <DataTable
              columns={bookingColumns}
              data={bookingsTableData}
              onDelete={(id) => handleDeleteDoc("bookings", id)}
              onEdit={(row) => setSelectedBooking(row)}
              exportFilename="bookings.csv"
            />
          </ModalPanel>
        )} 

        {/* REPORTS */}
        {activePanel === "reports" && (
          <ModalPanel title="Reports & Analytics" onClose={() => setActivePanel("dashboard")}>
            <ReportsPanel onClose={() => setActivePanel('dashboard')} />
          </ModalPanel>
        )}

        {/* MAPS */}
        {activePanel === "maps" && (
          <ModalPanel title="Maps" onClose={() => setActivePanel("dashboard")}>
            <div className="h-[calc(100vh-240px)] lg:h-[calc(100vh-200px)]">
              {cleanerMarkers.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500">No active cleaners broadcasting location</div>
              ) : (
                <MapContainer
                  className="h-full w-full rounded"
                  center={[cleanerMarkers[0].lat, cleanerMarkers[0].lng]}
                  zoom={12}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitBounds markers={cleanerMarkers} />

                  {cleanerMarkers.map((loc) => {
                    const user = usersMap[loc.uid] || {};
                    const image = user.photoURL || user.avatar || 'https://img.icons8.com/ios-filled/50/000000/worker-male.png';
                    const icon = createRoleIcon(image, 'cleaner');
                    return (
                      <Marker key={loc.sessionKey || loc.uid} position={[loc.lat, loc.lng]} icon={icon}>
                        <Popup>
                          <div style={{minWidth:200}}>
                            <div style={{fontWeight:600}}>{user.name || loc.name || loc.uid}</div>
                            <div className="text-sm text-gray-500">{user.phone || ''}</div>
                            <div className="text-sm mt-2">
                              Categories:{' '}
                              {Array.isArray(user.categories)
                                ? user.categories.join(', ')
                                : '—'}
                            </div>
                            <div className="text-sm text-gray-500 mt-2">Accuracy: {loc.accuracy ? Math.round(loc.accuracy) + ' m' : '—'}</div>
                            <div className="text-sm text-gray-500">Last: {timeAgo(new Date(loc.timestamp || loc.updatedAt))} ago</div>
                            <div className="mt-2 flex gap-2">
                              <button className="px-2 py-1 bg-blue-500 text-white rounded text-sm" onClick={() => setSelectedCleaner(normalizeCleanerForView(user || { id: loc.uid, name: loc.name }))}>View Profile</button>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                </MapContainer>
              )}
            </div>
          </ModalPanel>
        )}



        {/* ADMIN PROFILE EDIT */}
        {showAdminEdit && (
          <ModalPanel
            title="Edit Admin Profile"
            onClose={() => setShowAdminEdit(false)}
            overlay={true}
          >
            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={adminEditName}
                  onChange={(e) => setAdminEditName(e.target.value)}
                  placeholder="Admin Name"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={adminEditEmail}
                  onChange={(e) => setAdminEditEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-gray-400">(leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={adminEditPassword}
                  onChange={(e) => setAdminEditPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-4">
                <button
                  className={`px-4 py-2 rounded font-medium text-white ${
                    adminSaving ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  } transition`}
                  onClick={async () => {
                    setAdminSaving(true);
                    try {
                      const current = auth.currentUser;

                      // Update Firestore admin profile with new username/email/password fields
                      const firestorePatch = {};
                      if (adminEditName) firestorePatch.username = adminEditName;
                      if (adminEditEmail) firestorePatch.meta = { ...(adminProfile.meta || {}), email: adminEditEmail };
                      if (adminEditPassword) firestorePatch.password = adminEditPassword;

                      if (Object.keys(firestorePatch).length > 0) {
                        await updateAdminProfile(adminProfile.id, firestorePatch);
                      }

                      // If current user is logged in via Firebase Auth, sync email/password changes
                      if (current && adminProfile.meta?.authUid === current.uid) {
                        // Email update
                        if (adminEditEmail && adminEditEmail !== current.email) {
                          try {
                            await updateEmail(current, adminEditEmail);
                          } catch (e) {
                            if (e.code === 'auth/requires-recent-login') {
                              try {
                                const pwd = await requestReauth(current.email);
                                const cred = EmailAuthProvider.credential(current.email, pwd);
                                await reauthenticateWithCredential(current, cred);
                                await updateEmail(current, adminEditEmail);
                              } catch (reauthErr) {
                                if (reauthErr?.message === 'cancelled') {
                                  showToast('Email update cancelled', 'warning');
                                } else {
                                  showToast('Email update failed (reauth required)', 'error');
                                }
                              }
                            } else {
                              showToast('Email update failed: ' + (e?.message || 'Unknown error'), 'error');
                            }
                          }
                        }

                        // Password update
                        if (adminEditPassword) {
                          try {
                            await updatePassword(current, adminEditPassword);
                          } catch (e) {
                            if (e.code === 'auth/requires-recent-login') {
                              try {
                                const pwd = await requestReauth(current.email);
                                const cred = EmailAuthProvider.credential(current.email, pwd);
                                await reauthenticateWithCredential(current, cred);
                                await updatePassword(current, adminEditPassword);
                              } catch (reauthErr) {
                                if (reauthErr?.message === 'cancelled') {
                                  showToast('Password update cancelled', 'warning');
                                } else {
                                  showToast('Password update failed (reauth required)', 'error');
                                }
                              }
                            } else {
                              showToast('Password update failed: ' + (e?.message || 'Unknown error'), 'error');
                            }
                          }
                        }

                        showToast('Admin profile updated (Firebase Auth synced)', 'success');
                      } else {
                        // User is logged in via legacy username/password (not Firebase Auth)
                        showToast('Admin profile updated (Firestore only)', 'success');
                      }

                      setShowAdminEdit(false);
                      setAdminEditName('');
                      setAdminEditEmail('');
                      setAdminEditPassword('');
                    } catch (err) {
                      console.error("Save error:", err);
                      showToast('Failed to update admin profile: ' + (err?.message || 'Unknown error'), 'error');
                    } finally {
                      setAdminSaving(false);
                    }
                  }}
                  disabled={adminSaving}
                >
                  {adminSaving ? 'Saving...' : 'Save'}
                </button>

                <button
                  className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100 transition"
                  onClick={() => setShowAdminEdit(false)}
                  disabled={adminSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </ModalPanel>
        )}


        <ReauthModal
          open={reauthOpen}
          email={(reauthPromiseRef && reauthPromiseRef.current && reauthPromiseRef.current.email) || (adminProfile && adminProfile.email) || ''}
          onClose={handleReauthCancel}
          onConfirm={handleReauthConfirm}
        />

        {deleteConfirmModal && (
          <DeleteConfirmModal
            entityType={deleteConfirmModal.entityType}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        )}

        {/* AUDITS */}


      </main>
    </div>
  );
}
