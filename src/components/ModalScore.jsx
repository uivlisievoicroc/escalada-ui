import React, { useState, useEffect } from 'react';
import styles from './ControlPanel.module.css';

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
  const [score, setScore] = useState(initialScore.toString());
  const formatTime = (sec) => {
    if (typeof sec !== 'number' || Number.isNaN(sec)) return '';
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    if (isOpen) {
      setScore(initialScore.toString());
    }
  }, [isOpen, initialScore]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numericScore = parseFloat(score);
    const scaled = Math.round(numericScore * 10);
    // accept values that are integer or end in .1, and <= maxScore
    if (
      !isNaN(numericScore) &&
      (scaled % 10 === 1 || scaled % 10 === 0) &&
      scaled / 10 <= maxScore
    ) {
      // confirm if deviates from hold counter
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
        {submitError && (
          <div className={styles.modalAlertError}>
            {submitError}
          </div>
        )}
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel} htmlFor="modal-score-input">
              Score
            </label>
            <input
              type="number"
              step="0.1"
              id="modal-score-input"
              name="score"
              className={styles.modalInput}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              autoFocus
              required
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
