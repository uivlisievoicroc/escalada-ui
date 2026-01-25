import React, { useState, useEffect } from 'react';
import styles from './ControlPanel.module.css';

const ModalModifyScore = ({ isOpen, competitors, scores, times = {}, onClose, onSubmit }) => {
  const [selected, setSelected] = useState('');
  const [score, setScore] = useState('');
  const [timeValue, setTimeValue] = useState('');

  const formatTime = (sec) => {
    if (typeof sec !== 'number' || Number.isNaN(sec)) return '';
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const parseTimeInput = (val) => {
    if (!val) return null;
    if (/^\d{1,2}:\d{2}$/.test(val)) {
      const [m, s] = val.split(':').map(Number);
      return (m || 0) * 60 + (s || 0);
    }
    const num = Number(val);
    if (Number.isNaN(num)) return null;
    return num;
  };

  useEffect(() => {
    if (isOpen && competitors.length) {
      setSelected(competitors[0]);
    }
  }, [isOpen, competitors]);

  useEffect(() => {
    if (selected) {
      setScore(scores[selected]?.toString() ?? '');
      const t = times[selected];
      setTimeValue(t != null ? formatTime(t) : '');
    }
  }, [selected, scores, times]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
	        <div className={styles.modalHeader}>
	          <div>
	            <div className={styles.modalTitle}>Modify score</div>
	            <div className={styles.modalSubtitle}>
	              Update competitor score and time
	            </div>
	          </div>
	        </div>
	        <form
	          onSubmit={(e) => {
	            e.preventDefault();
            const numericScore = parseFloat(score);
            if (isNaN(numericScore)) {
              alert('Invalid score');
              return;
            }
            const parsedTime = parseTimeInput(timeValue);
            if (timeValue && parsedTime === null) {
              alert('Invalid time (use mm:ss or seconds).');
              return;
            }
            onSubmit(selected, numericScore, parsedTime);
            setSelected('');
            setScore('');
            setTimeValue('');
          }}
          className={styles.modalContent}
        >
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Select competitor</label>
            <select
              className={styles.modalSelect}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {competitors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Score</label>
            <input
              className={styles.modalInput}
              type="number"
              step="0.1"
              id="modify-score-input"
              name="score"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              required
            />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Time (mm:ss, optional)</label>
            <input
              className={styles.modalInput}
              type="text"
              placeholder="mm:ss"
              id="modify-time-input"
              name="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
            />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className="modern-btn modern-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modern-btn modern-btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalModifyScore;
