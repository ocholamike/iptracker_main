import React, { useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Get last 7 days labels ending today
function getLast7DaysLabels() {
  const today = new Date();
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(DAYS_OF_WEEK[d.getDay()]);
  }
  return labels;
}

// Normalize weekly data for single week
function normalizeWeekData(thisWeek = []) {
  const labels = getLast7DaysLabels();
  return labels.map((day, index) => ({
    day,
    thisWeek: thisWeek[index] || 0,
  }));
}

// Normalize weekly data for comparison with last week
function normalizeComparisonData(thisWeek = [], lastWeek = []) {
  const labels = getLast7DaysLabels();
  return labels.map((day, index) => ({
    day,
    thisWeek: thisWeek[index] || 0,
    lastWeek: lastWeek[index] || 0,
  }));
}

// Custom Tooltip component
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white p-2 rounded shadow border">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => {
        let name = p.dataKey === "thisWeek" ? "This Week" : "Last Week";
        // If comparing, make it "Last Week" for bars before today
        if (p.dataKey === "thisWeek" && payload.length === 2) {
          name = p.dataKey === "lastWeek" ? "Last Week" : "This Week";
        }
        return (
          <div key={p.dataKey} className="flex justify-between">
            <span className="capitalize">{name}:</span>
            <span>{p.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function WeeklyBarGraph({ title, thisWeek = [], lastWeek = [] }) {
  const [compare, setCompare] = useState(false);

  const chartData = compare
    ? normalizeComparisonData(thisWeek, lastWeek)
    : normalizeWeekData(thisWeek);

  return (
    <div className="bg-white p-4 rounded-2xl shadow h-80">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button
          onClick={() => setCompare(!compare)}
          className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          {compare ? "Single Week" : "Compare Last Week"}
        </button>
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />

          <Bar dataKey="thisWeek" fill="#3b82f6" radius={[6, 6, 0, 0]} />

          {compare && (
            <Bar dataKey="lastWeek" fill="#94a3b8" radius={[6, 6, 0, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
