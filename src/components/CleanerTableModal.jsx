import React, { useState, useMemo, useEffect } from "react";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
// Icons for sorting
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';

export default function DataTable({
  columns = [],
  data = [],
  onDelete,
  onEdit,
  exportFilename = "export.csv",
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir]);

  const filtered = useMemo(() => {
    let d = [...data];

    if (search) {
      const q = search.toLowerCase();
      d = d.filter((row) =>
        columns.some((c) =>
          String(row[c.key] ?? "").toLowerCase().includes(q)
        )
      );
    }

    if (sortKey) {
      d.sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "number") {
          return sortDir === "asc" ? va - vb : vb - va;
        }
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }

    return d;
  }, [data, search, sortKey, sortDir, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow">
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between mb-4">
        <input
          placeholder="Search..."
          className="border p-2 rounded w-full sm:w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex gap-2">
          <button onClick={() => exportCSV(columns, data, exportFilename)} className="btn">
            CSV
          </button>
          <button onClick={() => exportPDF(columns, filtered, exportFilename)} className="btn">
            PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto min-w-0">
        {/* Desktop table (hidden on small screens) */}
        <div className="hidden sm:block">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="p-2 text-left cursor-pointer min-w-0"
                  >
                    <div className="flex items-center gap-2" onClick={() => toggleSort(col.key)}>
                      <span className="truncate">{col.label}</span>

                      {/* Sort icon: up / down / neutral */}
                      <span className="text-gray-400 ml-1 flex-shrink-0">
                        {sortKey !== col.key ? (
                          <UnfoldMoreIcon fontSize="small" />
                        ) : sortDir === 'asc' ? (
                          <ArrowUpwardIcon fontSize="small" />
                        ) : (
                          <ArrowDownwardIcon fontSize="small" />
                        )}
                      </span>

                    </div>
                  </th>
                ))}
                {(onEdit || onDelete) && <th className="p-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row) => (
                <tr key={row.id} className="border-b hover:bg-gray-50 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className={"p-2 align-top min-w-0 " + (c.cellClass || ' break-words whitespace-normal') }>
                      {row[c.key]}
                    </td>
                  ))}
                  {(onEdit || onDelete) && (
                    <td className="p-2 flex gap-2">
                      {onEdit && (
                        <button className="btn-warning" onClick={() => onEdit(row)}>
                          View
                        </button>
                      )}
                      {onDelete && (
                        <button className="btn-danger" onClick={() => onDelete(row.id)}>
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards (visible on small screens) */}
        <div className="sm:hidden">
          <MobileCards
            rows={pageData}
            columns={columns}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-between text-sm">
        <span>{filtered.length} results</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span>{page}/{pages}</span>
          <button disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

/* helpers */

function exportCSV(columns, data, filename) {
  if (!data.length) return;
  const header = columns.map((c) => c.label).join(",");
  const rows = data.map((row) =>
    columns.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  saveAs(new Blob([header, ...rows].join("\n"), { type: "text/csv" }), filename);
}

function exportPDF(columns, data, filename) {
  const doc = new jsPDF();
  autoTable(doc, {
    head: [columns.map((c) => c.label)],
    body: data.map((row) => columns.map((c) => row[c.key] ?? "")),
  });
  doc.save(filename.replace(".csv", ".pdf"));
}

function MobileCards({ rows, columns, onEdit, onDelete }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="p-3 bg-white border rounded-lg shadow-sm">
          {columns.map((c) => (
            <div key={c.key} className="mb-2">
              <div className="text-xs text-gray-500">{c.label}</div>
              <div className="break-words font-medium text-sm">{row[c.key]}</div>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            {onEdit && <button className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded" onClick={() => onEdit(row)}>View</button>}
            {onDelete && <button className="px-3 py-1 text-sm bg-red-50 text-red-700 rounded" onClick={() => onDelete(row.id)}>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
