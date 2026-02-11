import React from 'react';
import type { Box } from '../types';
import { sanitizeBoxName } from '../utilis/sanitize';
import controlPanelStyles from './ControlPanel.module.css';
import styles from './AdminExportOfficialView.module.css';

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
      {/* Match Admin/Actions card sizing by using the same 3-column grid container. */}
      <div className="grid grid-cols-[repeat(3,minmax(260px,1fr))] gap-3 overflow-x-auto">
        <div className={controlPanelStyles.adminCard}>
          <div className={controlPanelStyles.adminCardTitle}>Export</div>

          <label className={controlPanelStyles.modalField}>
            <span className={controlPanelStyles.modalLabel}>Select category</span>
            <select
              className={controlPanelStyles.modalSelect}
              value={exportBoxId}
              onChange={(e) => onChangeExportBoxId(Number(e.target.value))}
              disabled={!hasBoxes}
            >
              {hasBoxes ? (
                listboxes.map((b, idx) => (
                  <option key={idx} value={idx}>
                    {sanitizeBoxName(b.categorie || `Box ${idx}`)}
                  </option>
                ))
              ) : (
                <option value={0}>No boxes available</option>
              )}
            </select>
          </label>

          {selectedBox && (
            <div className={styles.preview}>
              <div className={styles.previewTitle}>
                {sanitizeBoxName(selectedBox.categorie || `Box ${exportBoxId}`)}
              </div>
              <div>
                Routes: {selectedBox.routeIndex}/{selectedBox.routesCount}
              </div>
              <div>Competitors: {selectedBox.concurenti?.length ?? 0}</div>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-3">
            <button
              className="modern-btn modern-btn-primary"
              onClick={onExport}
              disabled={!hasBoxes}
              type="button"
            >
              Export official (ZIP)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminExportOfficialView;
