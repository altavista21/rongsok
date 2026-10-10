export type CategoryKey = 'kertas' | 'plastik' | 'besi' | 'tembaga';
export type Category = { key: CategoryKey; label: string; shortLabel: string; price: number; description: string };
export const DEFAULT_CATEGORIES: Category[] = [
 { key: 'kertas', label: 'Kertas / Dus Bekas', shortLabel: 'Kertas', price: 1500, description: 'Kardus, kertas campur' },
 { key: 'plastik', label: 'Plastik / Botol PET', shortLabel: 'Plastik', price: 2500, description: 'Botol PET dan plastik' },
 { key: 'besi', label: 'Besi / Logam', shortLabel: 'Besi', price: 4000, description: 'Besi dan logam' },
 { key: 'tembaga', label: 'Tembaga / Kabel', shortLabel: 'Tembaga', price: 65000, description: 'Tembaga dan kabel' },
];
export const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
