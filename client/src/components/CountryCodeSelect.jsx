import React from 'react';

const COUNTRIES = [
  { code: '+91', label: 'India (+91)' },
  { code: '+1', label: 'USA (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+92', label: 'Pakistan (+92)' },
  { code: '+880', label: 'Bangladesh (+880)' },
  { code: '+966', label: 'Saudi Arabia (+966)' }
];

export default function CountryCodeSelect({ value = '+91', onChange = () => {}, id, className = '' }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`badge country-code-select ${className}`}
      style={{ padding: '10px 12px', borderRadius: 12, minWidth: 120 }}
    >
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>{c.label}</option>
      ))}
    </select>
  );
}
