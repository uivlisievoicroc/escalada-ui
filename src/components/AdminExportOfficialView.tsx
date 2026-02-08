import React from 'react';
import type { Box } from '../types';
import { sanitizeBoxName } from '../utilis/sanitize';

/**
 * AdminExportOfficialView - UI for exporting official contest results as ZIP bundle.
 * 
 * @component
 * @param {Box[]} listboxes - Array of all contest boxes/categories
 * @param {number} exportBoxId - Currently selected box index for export
 * @param {Function} onChangeExportBoxId - Callback when user selects a different box
 * @param {Function} onExport - Callback to trigger the ZIP export (handled by parent)
 * 
 * Purpose:
 * - Allows admin to select a specific contest box (category) from a dropdown
 * - Displays box details (category name, routes progress, competitor count)
 * - Triggers export of official results bundle (rankings, times, metadata) as ZIP
 * 
 * Usage context:
 * - ControlPanel: Admin Actions Hub → Export tab
 * - Parent component handles actual export logic (API call to /api/export/{boxId})
 * 
 * Export bundle contents:
 * - rankings.json: Final standings with scores and rank points
 * - metadata.json: Category name, route count, timestamp
 * - (Future: PDF certificates, Excel sheets)
 * 
 * Disabled states:
 * - Dropdown and export button disabled when no boxes exist (listboxes.length === 0)
 * - Export button enabled only after box selection
 */
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
  // Derive UI state: check if any boxes exist and get the selected box
  const hasBoxes = listboxes.length > 0;
  const selectedBox = hasBoxes ? listboxes[exportBoxId] : null;

  return (
    <div className="space-y-4">
      {/* Instruction text explaining export functionality */}
      <div className="text-sm text-slate-600">
        Export official results as a ZIP bundle for a single box.
      </div>

      {/* Box selection card with dropdown and preview */}
      <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
        {/* Dropdown to select which box to export */}
        <label className="text-sm">
          Select box
          <select
            className="mt-1 w-full border border-slate-300 rounded px-2 py-1"
            value={exportBoxId}
            onChange={(e) => onChangeExportBoxId(Number(e.target.value))}
            disabled={!hasBoxes} // Disable if no boxes available
          >
            {hasBoxes ? (
              // Show all boxes with index and sanitized category name
              listboxes.map((b, idx) => (
                <option key={idx} value={idx}>
                  {idx} — {sanitizeBoxName(b.categorie || `Box ${idx}`)}
                </option>
              ))
            ) : (
              // Fallback option when no boxes exist
              <option value={0}>No boxes available</option>
            )}
          </select>
        </label>

        {/* Preview of selected box details (only shown when a box is selected) */}
        {selectedBox && (
          <div className="text-xs text-slate-500">
            {/* Category name (sanitized to prevent XSS) */}
            <div className="font-semibold text-slate-700">
              {sanitizeBoxName(selectedBox.categorie || `Box ${exportBoxId}`)}
            </div>
            {/* Route progress (current/total) */}
            <div>
              Routes: {selectedBox.routeIndex}/{selectedBox.routesCount}
            </div>
            {/* Competitor count (with fallback for undefined) */}
            <div>Competitors: {selectedBox.concurenti?.length ?? 0}</div>
          </div>
        )}
      </div>

      {/* Export button: triggers parent's onExport callback (API call to backend) */}
      <button
        className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        onClick={onExport}
        disabled={!hasBoxes} // Disable if no boxes to export
        type="button"
      >
        Export official (ZIP)
      </button>
    </div>
  );
};

export default AdminExportOfficialView;
