/**
 * sanity.js — Data sanity checks for financial data
 */

function sanityCheck(data) {
  const sanitized = {};
  const warnings = [];

  // Revenue growth: clamp to [-100%, +500%]
  if (data.revGr != null) {
    sanitized.revGr = Math.max(-1, Math.min(5, data.revGr));
    if (data.revGr !== sanitized.revGr) warnings.push(`revGr clamped from ${data.revGr} to ${sanitized.revGr}`);
  } else {
    sanitized.revGr = 0;
  }

  // Margins: clamp to [-100%, +100%]
  if (data.margins != null) {
    sanitized.margins = Math.max(-1, Math.min(1, data.margins));
  } else {
    sanitized.margins = 0;
  }

  return { sanitized, warnings };
}

module.exports = { sanityCheck };
