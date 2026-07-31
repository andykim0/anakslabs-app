/**
 * Compatibility export. The shared clinic engine owns layout resolution; existing callers keep
 * their import path so this structural merge cannot change emitted configuration bytes.
 */
export * from '@/lib/clinic-engine/layout-sections';
