import React from 'react';
import type { Box } from '../types';
import { sanitizeBoxName } from '../utilis/sanitize';

type AdminExportOfficialViewProps = {
  listboxes: Box[];
  exportBoxId: number;
  onChangeExportBoxId: (boxId: number) => void;
  onExport: () => void;
};

const AdminExportOfficialView: React.FC<AdminExportOfficialViewProps> = ({
  listboxes,
  exportBoxId,
  onChangeExportBoxId,
  onExport,
}) => {
  const hasBoxes = listboxes.length > 0;
  const selectedBox = hasBoxes ? listboxes[exportBoxId] : null;

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">
        Export official results as a ZIP bundle for a single box.
      </div>

      <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
        <label className="text-sm">
          Select box
          <select
            className="mt-1 w-full border border-slate-300 rounded px-2 py-1"
            value={exportBoxId}
            onChange={(e) => onChangeExportBoxId(Number(e.target.value))}
            disabled={!hasBoxes}
          >
            {hasBoxes ? (
              listboxes.map((b, idx) => (
                <option key={idx} value={idx}>
                  {idx} — {sanitizeBoxName(b.categorie || `Box ${idx}`)}
                </option>
              ))
            ) : (
              <option value={0}>No boxes available</option>
            )}
          </select>
        </label>

        {selectedBox && (
          <div className="text-xs text-slate-500">
            <div className="font-semibold text-slate-700">
              {sanitizeBoxName(selectedBox.categorie || `Box ${exportBoxId}`)}
            </div>
            <div>
              Routes: {selectedBox.routeIndex}/{selectedBox.routesCount}
            </div>
            <div>Competitors: {selectedBox.concurenti?.length ?? 0}</div>
          </div>
        )}
      </div>

      <button
        className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        onClick={onExport}
        disabled={!hasBoxes}
        type="button"
      >
        Export official (ZIP)
      </button>
    </div>
  );
};

export default AdminExportOfficialView;
