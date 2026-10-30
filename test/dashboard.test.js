import { describe, it, expect } from 'vitest';
import { dashboardColumns, filterRows } from '../src/scene/screens.js';

const rows = [
  { node: 'zion-01', region: 'south', status: 'online', load: 42 },
  { node: 'neb-07', region: 'east', status: 'degraded', load: 91 },
  { node: 'mega-3', region: 'north', status: 'offline', load: 0 },
];

describe('dashboardColumns', () => {
  it('uses the configured columns, else the keys of the first row', () => {
    expect(dashboardColumns({ rows, columns: ['node', 'load'] })).toEqual(['node', 'load']);
    expect(dashboardColumns({ rows })).toEqual(['node', 'region', 'status', 'load']);
    expect(dashboardColumns({ rows: [] })).toEqual([]);
  });
});

describe('filterRows', () => {
  it('returns every row with no filters', () => {
    expect(filterRows({ rows }, {})).toEqual(rows);
  });

  it('filters by chips, ignoring null chips', () => {
    expect(filterRows({ rows }, { chips: { region: 'east', status: null } })).toEqual([rows[1]]);
    expect(filterRows({ rows }, { chips: { status: 'online' } })).toEqual([rows[0]]);
  });

  it('matches the query case-insensitively across the visible columns only', () => {
    expect(filterRows({ rows }, { query: 'ZION' })).toEqual([rows[0]]);
    expect(filterRows({ rows }, { query: '  ' })).toEqual(rows);
    expect(filterRows({ rows, columns: ['node'] }, { query: 'south' })).toEqual([]);
  });

  it('combines chips and query', () => {
    expect(filterRows({ rows }, { chips: { status: 'online' }, query: 'north' })).toEqual([]);
  });
});
