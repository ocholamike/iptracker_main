// src/services/reportService.js
import { firestore as db } from "../firebaseConfig";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

/**
 * Get weekly bookings (count per day) using bookings.createdAt
 * returns array[7] for Sun..Sat
 */
export async function getWeeklyBookingStats() {
  const snapshot = await getDocs(collection(db, "bookings"));
  const arr = [0, 0, 0, 0, 0, 0, 0];
  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    if (!ts) return;
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    arr[date.getDay()] += 1;
  });
  return arr;
}

/**
 * Get weekly earnings (sum of payments per day)
 */
export async function getWeeklyEarningsStats() {
  const snapshot = await getDocs(collection(db, "payments"));
  const arr = [0, 0, 0, 0, 0, 0, 0];
  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    const date = ts?.toDate ? ts.toDate() : new Date();
    const amount = Number(data.amount || 0);
    arr[date.getDay()] += amount;
  });
  return arr;
}

/**
 * Get income per cleaner (aggregate payments)
 */
export async function getIncomePerCleaner(fromDate = null, toDate = null) {
  // Optional fromDate / toDate are JavaScript Date objects
  let q = collection(db, "payments");
  const snapshot = await getDocs(q);
  const map = {};
  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    const date = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (fromDate && date && date < fromDate) return;
    if (toDate && date && date > toDate) return;
    const id = data.cleanerId || "unknown";
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
  const map = {};
  snapshot.forEach((d) => {
    const data = d.data();
    const ts = data.createdAt;
    const date = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (fromDate && date && date < fromDate) return;
    if (toDate && date && date > toDate) return;
    const id = data.cleanerId || "unknown";
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
