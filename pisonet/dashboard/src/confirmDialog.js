// confirmDialog.js
import Swal from 'sweetalert2';

// Base style matching the PisoNet dashboard theme
const baseConfig = {
  confirmButtonColor: '#10b981', // matches your green theme
  cancelButtonColor: '#6b7280',
  reverseButtons: true,
  buttonsStyling: true,
};

// Standard confirm — used for commands (shutdown/restart/lock)
export function confirmAction({ title, text, confirmText = 'Yes, continue', icon = 'warning' }) {
  return Swal.fire({
    ...baseConfig,
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
  });
}

// Danger confirm — used for irreversible actions (delete machine, delete account)
export function confirmDanger({ title, text, confirmText = 'Yes, delete it' }) {
  return Swal.fire({
    ...baseConfig,
    title,
    text,
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#ef4444', // red for destructive actions
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
  });
}

// Success toast-style popup (optional, for confirmations after an action)
export function showSuccess(text, title = 'Success', duration = 1800) {
  return Swal.fire({
    ...baseConfig,
    icon: 'success',
    title,
    text,
    timer: duration,
    showConfirmButton: false,
  });
}