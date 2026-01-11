// src/services/reportService.js
import { firestore as db } from "../firebaseConfig";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

/**
 * Get weekly bookings (count per day) using bookings.createdAt
 * returns array[7] for Sun..Sat
 */
export async function getWeeklyBookingStats(fromDate = null, toDate = null) {
  // Return counts per day for the supplied date range (inclusive).
  // If no range supplied, default to last 7 days ending today.
  const end = toDate ? new Date(toDate) : new Date();
  const start = fromDate ? new Date(fromDate) : new Date(end);
  if (!fromDate) start.setDate(end.getDate() - 6);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  // Build date slots
  const days = [];
  const pointer = new Date(start);
  while (pointer <= end) {
    days.push(new Date(pointer));
    pointer.setDate(pointer.getDate() + 1);
  }

  const counts = days.map(() => 0);

  const snapshot = await getDocs(collection(db, "bookings"));
  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    if (!ts) return;
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (date < start || date > end) return;
    const idx = Math.floor((date.setHours(0,0,0,0) - start.getTime()) / (24*60*60*1000));
    if (idx >= 0 && idx < counts.length) counts[idx] += 1;
  });

  return counts;
}

/**
 * Get weekly earnings (sum of payments per day)
 */
export async function getWeeklyEarningsStats(fromDate = null, toDate = null) {
  // Return earnings per day for the supplied date range (inclusive).
  const end = toDate ? new Date(toDate) : new Date();
  const start = fromDate ? new Date(fromDate) : new Date(end);
  if (!fromDate) start.setDate(end.getDate() - 6);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  const days = [];
  const pointer = new Date(start);
  while (pointer <= end) {
    days.push(new Date(pointer));
    pointer.setDate(pointer.getDate() + 1);
  }

  const totals = days.map(() => 0);

  const snapshot = await getDocs(collection(db, "payments"));
  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    const date = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
    if (date < start || date > end) return;
    const idx = Math.floor((date.setHours(0,0,0,0) - start.getTime()) / (24*60*60*1000));
    if (idx >= 0 && idx < totals.length) totals[idx] += Number(data.amount || 0);
  });
  return totals;
}

/**
 * Get income per cleaner (aggregate payments)
 */
export async function getIncomePerCleaner(fromDate = null, toDate = null) {
  // Optional fromDate / toDate are JavaScript Date objects
  const snapshot = await getDocs(collection(db, "payments"));

  // Preload bookings so we can resolve cleanerId from bookingId when payments miss cleanerId
  const bookingSnap = await getDocs(collection(db, "bookings"));
  const bookingMap = {};
  bookingSnap.forEach((b) => {
    const bd = b.data();
    bookingMap[b.id] = bd;
  });

  const map = {};

  const resolveCleanerId = (data) => {
    if (!data) return 'unknown';
    // common patterns
    const candidates = [data.cleanerId, data.cleanerUid, data.cleaner_id, data.cleaner, data.cleanerID];
    for (const c of candidates) {
      if (c) return String(c);
    }
    // booking fallback
    const bookingId = data.bookingId || data.booking_id || data.booking;
    if (bookingId && bookingMap[bookingId] && (bookingMap[bookingId].cleanerId || bookingMap[bookingId].cleanerUid)) {
      return String(bookingMap[bookingId].cleanerId || bookingMap[bookingId].cleanerUid);
    }
    return 'unknown';
  };

  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    const date = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (fromDate && date && date < fromDate) return;
    if (toDate && date && date > toDate) return;
    const id = resolveCleanerId(data) || 'unknown';
    map[id] = (map[id] || 0) + Number(data.amount || 0);
  });
  return Object.entries(map).map(([cleanerId, total]) => ({ cleanerId, total }));
}

export async function deleteIncomeForCleaner(cleanerId, fromDate = null, toDate = null) {
  // Deletes payments for a cleaner in the optional date range
  const paymentsRef = collection(db, "payments");
  const snapshot = await getDocs(paymentsRef);
  const deletes = [];
  snapshot.forEach((d) => {
    const data = d.data();
    if ((data.cleanerId || "") !== cleanerId) return;
    const ts = data.createdAt;
    const date = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (fromDate && date && date < fromDate) return;
    if (toDate && date && date > toDate) return;
    deletes.push(d.id);
  });

  const results = [];
  for (const id of deletes) {
    try {
      await deleteDoc(doc(db, "payments", id));
      results.push(id);
    } catch (err) {
      console.error("Failed to delete payment", id, err);
    }
  }
  return results;
}

/**
 * Get ratings stats aggregated by cleaner - expects ratings collection
 */
export async function getRatingsPerCleaner(fromDate = null, toDate = null) {
  const snapshot = await getDocs(collection(db, "ratings"));
  // Preload bookings as possible fallback for cleaner lookup
  const bookingSnap = await getDocs(collection(db, "bookings"));
  const bookingMap = {};
  bookingSnap.forEach((b) => { bookingMap[b.id] = b.data(); });

  const map = {};

  const resolveCleanerId = (data) => {
    if (!data) return 'unknown';
    const candidates = [data.cleanerId, data.cleanerUid, data.cleaner_id, data.cleaner, data.cleanerID];
    for (const c of candidates) {
      if (c) return String(c);
    }
    const bookingId = data.bookingId || data.booking_id || data.booking;
    if (bookingId && bookingMap[bookingId] && (bookingMap[bookingId].cleanerId || bookingMap[bookingId].cleanerUid)) {
      return String(bookingMap[bookingId].cleanerId || bookingMap[bookingId].cleanerUid);
    }
    return 'unknown';
  };

  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    const date = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (fromDate && date && date < fromDate) return;
    if (toDate && date && date > toDate) return;
    const id = resolveCleanerId(data) || 'unknown';
    map[id] = map[id] || { total: 0, count: 0 };
    map[id].total += Number(data.rating || 0);
    map[id].count += 1;
  });
  return Object.entries(map).map(([cleanerId, v]) => ({
    cleanerId,
    average: v.count ? v.total / v.count : 0,
    count: v.count,
  }));
}
