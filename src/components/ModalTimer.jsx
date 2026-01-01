import React, { useState } from 'react';

const ModalTimer = ({
  isOpen,
  onClose,
  onSet,
  timeCriterionEnabled = false,
  onToggleTimeCriterion,
}) => {
  const [time, setTime] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!time.match(/^\d{1,2}:[0-5]\d$/)) return;
    onSet(time);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="mt-4 p-6 bg-white border border-gray-300 rounded shadow-md max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">Set climbing time (MM:SS)</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          id="timer-input"
          name="climbingTime"
          placeholder="mm:ss"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full border border-gray-300 p-2 rounded"
          required
        />
        {typeof onToggleTimeCriterion === 'function' && (
          <button
            type="button"
            onClick={onToggleTimeCriterion}
            className="w-full px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
          >
            Set time as the second criterion ({timeCriterionEnabled ? 'On' : 'Off'})
          </button>
        )}
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 border border-gray-400 rounded"
          >
            Anulează
          </button>
          <button
            type="submit"
            className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Set
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModalTimer;
