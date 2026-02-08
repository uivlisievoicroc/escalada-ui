/**
 * ModalTimer Component
 *
 * Modal dialog for setting default climbing time in ControlPanel.
 * Validates MM:SS format input and passes value to parent on submit.
 *
 * **Purpose:**
 * - Admin configuration: Set default timer for all boxes
 * - Applied to newly initiated routes (stored in localStorage as 'climbingTime')
 * - Normalized on backend (e.g., "5:00" → "05:00" in validation)
 *
 * **Usage:**
 * - Displayed when admin clicks "Set Timer" button in ControlPanel
 * - Input format: MM:SS (e.g., "5:00", "05:30", "10:00")
 * - Validation: Regex `/^\d{1,2}:[0-5]\d$/` (1-2 digit minutes, 00-59 seconds)
 *
 * **Props:**
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Callback to close modal without saving
 * @param {function} onSet - Callback with validated time string (format: "MM:SS")
 *
 * **State Management:**
 * - `time`: Current input value (validated on submit, not on change)
 * - Reset to empty string on close (via parent re-mount or local clear)
 *
 * **Validation:**
 * - Format: MM:SS with colon separator
 * - Minutes: 1-2 digits (0-99, but typically 1-10 for climbing)
 * - Seconds: Exactly 2 digits, 00-59 range (enforced by [0-5]\d pattern)
 * - Invalid input: Submit button does nothing (silent validation failure)
 *
 * @component
 * @example
 * // In ControlPanel:
 * <ModalTimer
 *   isOpen={timerModalOpen}
 *   onClose={() => setTimerModalOpen(false)}
 *   onSet={(time) => { localStorage.setItem('climbingTime', time); }}
 * />
 */
import React, { useState } from 'react';

/**
 * ModalTimer Component
 *
 * Time input modal for ControlPanel admin configuration.
 * Validates MM:SS format before passing to parent.
 *
 * **Key Features:**
 * - Inline modal (not fullscreen overlay)
 * - Client-side regex validation (no async/server check)
 * - Cancel/Set buttons (Cancel closes without save, Set validates + saves + closes)
 *
 * **Props Destructuring:**
 * - `isOpen`: Boolean visibility flag (returns null when false)
 * - `onClose`: Called on Cancel button click
 * - `onSet`: Called on Set button click with validated time string
 *
 * **Local State:**
 * - `time`: Controlled input value (updated on every keystroke via onChange)
 */
const ModalTimer = ({ isOpen, onClose, onSet }) => {
  // Local state: Current time input (format: "MM:SS")
  const [time, setTime] = useState('');

  /**
   * Handle Form Submission
   *
   * Validates time format and calls parent callbacks if valid.
   * Uses regex pattern to enforce MM:SS structure.
   *
   * **Validation Regex: `/^\d{1,2}:[0-5]\d$/`**
   * - `^`: Start of string
   * - `\d{1,2}`: 1 or 2 digits for minutes (e.g., "5" or "05")
   * - `:`: Literal colon separator
   * - `[0-5]\d`: Seconds (00-59)
   *   - `[0-5]`: First digit must be 0-5 (prevents 60-99)
   *   - `\d`: Second digit can be 0-9
   * - `$`: End of string
   *
   * **Valid Examples:**
   * - "5:00" → ✓ (5 minutes)
   * - "05:30" → ✓ (5 minutes 30 seconds)
   * - "10:45" → ✓ (10 minutes 45 seconds)
   *
   * **Invalid Examples:**
   * - "5:60" → ✗ (seconds > 59)
   * - "5" → ✗ (missing colon and seconds)
   * - "5:5" → ✗ (seconds must be 2 digits)
   * - "abc" → ✗ (non-numeric)
   *
   * **Flow:**
   * 1. Prevent default form submission (avoids page reload)
   * 2. Validate format with regex
   * 3. If invalid: Early return (silent failure, no error message)
   * 4. If valid: Call onSet(time) to pass value to parent
   * 5. Call onClose() to dismiss modal
   *
   * **Why Silent Failure?**
   * - Input has `required` attribute (prevents empty submit)
   * - Regex validation is final check (should match user expectation from placeholder)
   * - No error message UI (keeps modal simple, user can retry)
   *
   * @param {Event} e - Form submit event
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    // Validate format: MM:SS with proper ranges
    if (!time.match(/^\d{1,2}:[0-5]\d$/)) return;
    // Valid: Pass to parent and close modal
    onSet(time);
    onClose();
  };

  /**
   * Early Return: Hidden State
   *
   * When `isOpen` is false, return null to remove modal from DOM.
   * Prevents rendering when not needed (better performance than CSS display:none).
   */
  if (!isOpen) return null;

  /**
   * Render: Modal UI
   *
   * **Structure:**
   * 1. Container: White card with shadow (inline modal, not fullscreen overlay)
   * 2. Heading: "Set default climbing time (MM:SS)" instruction
   * 3. Form: Single text input with validation on submit
   * 4. Actions: Cancel (no save) / Set (validate + save + close)
   *
   * **Styling:**
   * - Inline modal (mt-4 for spacing from parent content)
   * - Max width 'md' for mobile-friendly sizing
   * - Centered with mx-auto
   * - White background with border and shadow for elevation
   *
   * **Input Field:**
   * - Type: text (not time input, to allow MM:SS format with single-digit minutes)
   * - ID: "timer-input" (for potential label association)
   * - Name: "climbingTime" (semantic form field name)
   * - Placeholder: "mm:ss" (lowercase to indicate flexible format)
   * - Controlled: value={time}, onChange updates local state on every keystroke
   * - Required: HTML5 validation prevents empty submit
   *
   * **Action Buttons:**
   * - Cancel: type="button" (prevents form submit), onClick={onClose}
   * - Set: type="submit" (triggers handleSubmit validation)
   */
  return (
    <div className="mt-4 p-6 bg-white border border-gray-300 rounded shadow-md max-w-md mx-auto">
      {/* Heading: Instruction with format hint */}
      <h2 className="text-xl font-semibold mb-4">Set default climbing time (MM:SS)</h2>
      
      {/* Form: Time input with validation on submit */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Input: Controlled text field for MM:SS format */}
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
        
        {/* Action buttons: Cancel (no save) / Set (validate + save) */}
        <div className="flex justify-end space-x-2">
          {/* Cancel button: Close without saving */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 border border-gray-400 rounded"
          >
            Cancel
          </button>
          
          {/* Set button: Validate format, save, and close */}
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
