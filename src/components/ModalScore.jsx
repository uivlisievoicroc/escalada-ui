import React, { useState, useEffect } from 'react';

const ModalScore = ({
  isOpen,
  competitor,
  initialScore = 0,
  maxScore,
  registeredTime,
  onClose,
  onSubmit,
}) => {
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

  const handleSubmit = (e) => {
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
      onSubmit(scaled / 10);
      setScore('');
      onClose();
    } else {
      alert(`Insert valid score: only integers or values ending in .1 between 0 and ${maxScore}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute bg-gray-500 bg-opacity-75 flex items-center justify-center">
      <div className="bg-white p-4 rounded shadow-md w-64">
        <h2 className="text-lg font-semibold mb-3">
          Insert score for {competitor} (0 - {maxScore})
        </h2>
        {registeredTime != null && (
          <p className="text-sm text-gray-600 mb-2">
            Registered time: {formatTime(registeredTime)}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <input
            type="number"
            step="0.1"
            id="modal-score-input"
            name="score"
            className="border border-gray-300 p-2 rounded w-full"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            autoFocus
            required
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="px-4 py-1 border rounded" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-1 bg-blue-600 text-white rounded">
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalScore;
