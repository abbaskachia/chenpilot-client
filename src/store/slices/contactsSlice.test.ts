import { describe, expect, it } from 'vitest';
import { Contact } from '@/types';
import { filterContacts, hasContactAddressChanged, paginateContacts } from './contactsSlice';

describe('hasContactAddressChanged', () => {
  it('detects a changed destination but ignores surrounding whitespace', () => {
    expect(hasContactAddressChanged('GOLD', 'GNEW')).toBe(true);
    expect(hasContactAddressChanged('GOLD', '  GOLD  ')).toBe(false);
  });
});

describe('paginateContacts', () => {
  it('limits a large address book to one page and returns the next page', () => {
    const fixture: Contact[] = Array.from({ length: 250 }, (_, index) => ({
      id: `contact-${index + 1}`,
      name: `Contact ${index + 1}`,
      address: `G${String(index + 1).padStart(55, 'A')}`,
      tokenType: 'XLM',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }));

    const firstPage = paginateContacts(fixture, 1);
    const secondPage = paginateContacts(fixture, 2);

    expect(firstPage).toHaveLength(24);
    expect(firstPage[0]?.id).toBe('contact-1');
    expect(firstPage.at(-1)?.id).toBe('contact-24');
    expect(secondPage).toHaveLength(24);
    expect(secondPage[0]?.id).toBe('contact-25');
  });

  it('keeps search results from the entire address book reachable', () => {
    const fixture: Contact[] = Array.from({ length: 250 }, (_, index) => ({
      id: `contact-${index + 1}`,
      name: index === 229 ? 'Searchable Contact' : `Contact ${index + 1}`,
      address: `G${String(index + 1).padStart(55, 'A')}`,
      tokenType: 'XLM',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }));

    const results = filterContacts(fixture, 'searchable');

    expect(results).toHaveLength(1);
    expect(paginateContacts(results, 1)[0]?.id).toBe('contact-230');
  });

  it('returns only remaining contacts on the final page', () => {
    const fixture = Array.from({ length: 25 }, (_, index) => ({
      id: String(index + 1),
      name: `Contact ${index + 1}`,
      address: 'G'.padEnd(56, 'A'),
      tokenType: 'XLM' as const,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }));

    expect(paginateContacts(fixture, 2)).toHaveLength(1);
  });
});