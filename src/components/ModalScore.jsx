import React, { useState, useEffect } from 'react';
import styles from './ControlPanel.module.css';

// Generic score input modal used by the admin/control flows.
/**
 * @typedef {Object} ModalScoreProps
 * @property {boolean} isOpen
 * @property {string} competitor
 * @property {number} [initialScore]
 * @property {number} maxScore
 * @property {number | undefined} registeredTime
 * @property {string | null | undefined} [submitError]
 * @property {boolean} [submitPending]
 * @property {boolean} [closeOnSubmit]
 * @property {() => void} onClose
 * @property {(score: number) => any} onSubmit
 */

/** @param {ModalScoreProps} props */
const ModalScore = (props) => {
  const {
    isOpen,
    competitor,
    initialScore = 0,
    maxScore,
    registeredTime,
    submitError = null,
    submitPending = false,
    closeOnSubmit = true,
    onClose,
    onSubmit,
  } = props;

  // Keep the input as a string so users can type partial values (e.g. "12,")
  // and we only validate/normalize when they submit.
  const [score, setScore] = useState(initialScore.toString());

  // Format a server-provided time value (seconds) as mm:ss for display in the header.
  const formatTime = (sec) => {
    if (typeof sec !== 'number' || Number.isNaN(sec)) return '';
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    // Reset input every time the modal opens so it starts from the current hold counter.
    if (isOpen) {
      setScore(initialScore.toString());
    }
  }, [isOpen, initialScore]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Normalize user input and validate it against contest rules.
    const raw = typeof score === 'string' ? score.trim() : String(score ?? '').trim();
    // Accept both "." and "," as decimal separators (common in RO locales).
    const normalized = raw.replace(',', '.');
    const numericScore = parseFloat(normalized);

    // Work in "tenths" to avoid floating point edge cases when checking allowed increments.
    const scaled = Math.round(numericScore * 10);
    // Accept values that are integers or end in ".1", and are within the allowed range.
    if (
      !isNaN(numericScore) &&
      (scaled % 10 === 1 || scaled % 10 === 0) &&
      scaled / 10 <= maxScore
    ) {
      // If the user overrides the hold counter value, confirm explicitly to avoid mistakes.
      if (numericScore !== initialScore) {
        const ok = window.confirm(
          'Inserted value different from the hold counter. Are you sure you want to continue?',
        );
        if (!ok) {
          setScore(initialScore.toString());
          return;
        }
      }
      try {
        const result = await onSubmit(scaled / 10);
        // Allow the parent to keep the modal open by returning `false` (e.g. validation error).
        if (closeOnSubmit && result !== false) {
          setScore('');
          onClose();
        }
      } catch {
        // Keep modal open so caller can show error
      }
    } else {
      alert(`Insert valid score: only integers or values ending in .1 between 0 and ${maxScore}`);
    }
  };

  // The modal is mounted only while it's open.
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>
              Insert score for {competitor}
            </div>
            <div className={styles.modalSubtitle}>
              Score range: 0 - {maxScore}
              {registeredTime != null && ` • Time: ${formatTime(registeredTime)}`}
            </div>
          </div>
        </div>
        {/* Error is controlled by the parent submit handler so it can surface backend failures. */}
        {submitError && (
          <div className={styles.modalAlertError}>
            {submitError}
          </div>
        )}
        <form onSubmit={handleSubmit} className={styles.modalContent} noValidate>
          <div className={styles.modalField}>
            <label className={styles.modalLabel} htmlFor="modal-score-input">
              Score
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 12 or 12.1"
              id="modal-score-input"
              name="score"
              className={styles.modalInput}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              autoFocus
              disabled={submitPending}
            />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className="modern-btn modern-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="modern-btn modern-btn-primary"
              disabled={submitPending}
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalScore;
