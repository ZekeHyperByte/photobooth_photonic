import type { Package, Template, Filter } from '@photonic/types';

// LocalStorage wrapper for caching data
export const storage = {
  // Packages
  setPackages: (packages: Package[]): void => {
    localStorage.setItem('cached_packages', JSON.stringify(packages));
  },

  getPackages: (): Package[] | null => {
    const cached = localStorage.getItem('cached_packages');
    return cached ? JSON.parse(cached) : null;
  },

  // Templates
  setTemplates: (templates: Template[]): void => {
    localStorage.setItem('cached_templates', JSON.stringify(templates));
  },

  getTemplates: (): Template[] | null => {
    const cached = localStorage.getItem('cached_templates');
    return cached ? JSON.parse(cached) : null;
  },

  // Filters
  setFilters: (filters: Filter[]): void => {
    localStorage.setItem('cached_filters', JSON.stringify(filters));
  },

  getFilters: (): Filter[] | null => {
    const cached = localStorage.getItem('cached_filters');
    return cached ? JSON.parse(cached) : null;
  },

  // Clear all cache
  clearAll: (): void => {
    localStorage.clear();
  },
};
