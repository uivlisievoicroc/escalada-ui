import React, { useState, useEffect } from 'react';

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
    <div className="absolute bg-gray-500 bg-opacity-75 flex items-center justify-center inset-0 z-50">
      <div className="bg-white p-4 rounded shadow-md w-72">
        <h2 className="text-lg font-semibold mb-3">Modify score</h2>
        <div className="mb-4">
          <label className="block mb-1 font-semibold">Select competitor</label>
          <select
            className="w-full border p-2 rounded"
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
        >
          <label className="block mb-1 font-semibold">Score</label>
          <input
            className="w-full border p-2 rounded"
            type="number"
            step="0.1"
            id="modify-score-input"
            name="score"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            required
          />
          <label className="block mb-1 font-semibold mt-3">Time (mm:ss, optional)</label>
          <input
            className="w-full border p-2 rounded"
            type="text"
            placeholder="mm:ss"
            id="modify-time-input"
            name="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="px-4 py-1 border rounded" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-1 bg-blue-600 text-white rounded">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalModifyScore;
