import { ArrowUpDown } from 'lucide-react';

/**
 * The order a list is shown in. The server does the sorting (see the backend's
 * utils/listSort.js), so a paged list is ordered across every page, not just
 * the one on screen. A to Z is the default everywhere.
 */
export const SORT_OPTIONS = [
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

export const DEFAULT_SORT = 'az';

export default function SortSelect({ value, onChange, label = 'Sort' }) {
  return (
    <label className="sort-select">
      <ArrowUpDown size={15} aria-hidden="true" />
      <span className="sort-select__label">{label}</span>
      <select
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
