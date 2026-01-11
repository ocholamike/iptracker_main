import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getWeeklyBookingStats, getWeeklyEarningsStats, getIncomePerCleaner, getRatingsPerCleaner } from '../services/reportService';
import DataTable from './CleanerTableModal';
import BookIcon from '@mui/icons-material/Book';
import PaidIcon from '@mui/icons-material/Paid';
import StarIcon from '@mui/icons-material/Star';

export default function ReportsPanel({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [weeklyBookings, setWeeklyBookings] = useState(new Array(7).fill(0));
  const [weeklyEarnings, setWeeklyEarnings] = useState(new Array(7).fill(0));
  const [incomePerCleaner, setIncomePerCleaner] = useState([]);
  const [ratingsPerCleaner, setRatingsPerCleaner] = useState([]);
  // Default to last 7 days to match dashboard weekly totals
  const defaultTo = new Date();
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultTo.getDate() - 6);
  defaultFrom.setHours(0,0,0,0);
  defaultTo.setHours(23,59,59,999);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);

  const fetch = async () => {
    setLoading(true);
    try {
      const wb = await getWeeklyBookingStats();
      const we = await getWeeklyEarningsStats();
      const inc = await getIncomePerCleaner(fromDate, toDate);
      const ratings = await getRatingsPerCleaner(fromDate, toDate);

      // Resolve cleaner names for nicer display
      let cleanerMap = {};
      try {
        const { getUsersByRole } = await import('../services/userService');
        const cleaners = await getUsersByRole('cleaner');
        cleanerMap = cleaners.reduce((m, c) => ({ ...m, [c.uid || c.id]: c }), {});
      } catch (e) {
        console.warn('Failed to fetch cleaners for name resolution', e);
      }

      setWeeklyBookings(wb);
      setWeeklyEarnings(we);
      setIncomePerCleaner(inc.map(i => ({ id: i.cleanerId, cleanerId: i.cleanerId, total: i.total, cleanerName: (cleanerMap[i.cleanerId]?.name || cleanerMap[i.cleanerId]?.fullName || cleanerMap[i.cleanerId]?.email || i.cleanerId) })));
      setRatingsPerCleaner(ratings.map(r => ({ ...r, cleanerName: (cleanerMap[r.cleanerId]?.name || cleanerMap[r.cleanerId]?.fullName || cleanerMap[r.cleanerId]?.email || r.cleanerId) })));
    } catch (err) {
      console.error('Failed to fetch reports', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [fromDate, toDate]);

  // Compose dataset for chart based on date range (day label = Mon 12)
  const dayLabels = [];
  const ptr = new Date(fromDate);
  while (ptr <= toDate) {
    const short = ptr.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    dayLabels.push(short);
    ptr.setDate(ptr.getDate() + 1);
  }

  const chartData = dayLabels.map((label, i) => ({
    day: label,
    bookings: weeklyBookings[i] || 0,
    earnings: weeklyEarnings[i] || 0
  }));

  const totalBookings = weeklyBookings.reduce((a,b) => a + Number(b || 0), 0);
  const totalEarnings = weeklyEarnings.reduce((a,b) => a + Number(b || 0), 0);
  const avgRating = ratingsPerCleaner.length ? (ratingsPerCleaner.reduce((a,r) => a + Number(r.average || 0), 0) / ratingsPerCleaner.length).toFixed(2) : '—';

  // Combine income and rating data for table
  const topCleaners = incomePerCleaner.map(i => {
    const r = ratingsPerCleaner.find(x => x.cleanerId === i.cleanerId) || {};
    return {
      id: i.cleanerId,
      cleanerId: i.cleanerId,
      cleanerName: i.cleanerName || i.cleanerId,
      total: i.total,
      average: Number(r.average || 0).toFixed(2),
      count: r.count || 0
    };
  }).sort((a,b) => b.total - a.total);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold">Reports & Analytics</h2>
        <div className="flex gap-2 items-center">
          <label className="text-sm">From:</label>
          <input type="date" className="border p-1 rounded" value={fromDate ? fromDate.toISOString().slice(0,10) : ''} onChange={(e) => setFromDate(e.target.value ? new Date(e.target.value) : null)} />
          <label className="text-sm">To:</label>
          <input type="date" className="border p-1 rounded" value={toDate ? toDate.toISOString().slice(0,10) : ''} onChange={(e) => setToDate(e.target.value ? (new Date(e.target.value + 'T23:59:59')) : null)} />
          <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={fetch}>Refresh</button>
          <button className="px-3 py-1 bg-gray-200 text-gray-800 rounded" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-4 rounded-2xl shadow flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <BookIcon />
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Bookings (week)</div>
            <div className="text-2xl font-bold">{loading ? '—' : totalBookings}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
            <PaidIcon />
          </div>
          <div>
            <div className="text-sm text-gray-500">Total Revenue (week)</div>
            <div className="text-2xl font-bold">{loading ? '—' : totalEarnings.toFixed(0)}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
            <StarIcon />
          </div>
          <div>
            <div className="text-sm text-gray-500">Average Rating</div>
            <div className="text-2xl font-bold">{avgRating}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white p-4 rounded-2xl shadow h-64">
          <h3 className="text-md font-semibold mb-2">Bookings vs Revenue (this week)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" interval={0} tick={{ fontSize: 12 }} tickMargin={8} />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Bar yAxisId="left" dataKey="bookings" fill="#6366F1" barSize={24} />
              <Line yAxisId="right" type="monotone" dataKey="earnings" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow">
          <h3 className="text-md font-semibold mb-2">Top Cleaners (by revenue)</h3>
          {topCleaners.length === 0 ? (
            <div className="text-sm text-gray-500">No data available</div>
          ) : (
            <DataTable
              columns={[
                { key: 'cleanerName', label: 'Cleaner' },
                { key: 'total', label: 'Total Income', cellClass: 'whitespace-nowrap text-right' },
                { key: 'average', label: 'Average Rating', cellClass: 'whitespace-nowrap' },
                { key: 'count', label: 'Rating Count', cellClass: 'whitespace-nowrap' }
              ]}
              data={topCleaners}
              exportFilename="top_cleaners.csv"
            />
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow">
        <h3 className="text-md font-semibold mb-2">Ratings Overview</h3>
        <div className="text-sm text-gray-500 mb-2">Ratings per cleaner (average & count)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-2 text-left">Cleaner</th>
                <th className="p-2 text-left">Average</th>
                <th className="p-2 text-left">Count</th>
              </tr>
            </thead>
            <tbody>
              {ratingsPerCleaner.map(r => (
                <tr key={r.cleanerId} className="border-b">
                  <td className="p-2">{r.cleanerName || r.cleanerId}</td>
                  <td className="p-2 whitespace-nowrap">{Number(r.average).toFixed(2)}</td>
                  <td className="p-2 whitespace-nowrap">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
