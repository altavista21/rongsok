import localforage from 'localforage';
import type { CategoryKey } from './catalog';
export type InvoiceItem = { item_id: string; category_key: CategoryKey; category_label: string; price_per_kg: number; weight_kg: number; subtotal: number };
export type Transaction = { transaction_id: string; created_at: string; customer_name: string; items: InvoiceItem[]; grand_total: number; status: 'COMPLETED' };
export const transactionsStore = localforage.createInstance({ name: 'CV_Rongsok_DB', storeName: 'transactions', description: 'Riwayat nota CV Rongsok Sejahtera' });
export const settingsStore = localforage.createInstance({ name: 'CV_Rongsok_DB', storeName: 'settings', description: 'Konfigurasi harga barang rongsok' });
export async function getTransactions(): Promise<Transaction[]> { const items: Transaction[] = []; await transactionsStore.iterate<Transaction, void>((value) => { if (value?.transaction_id) items.push(value); }); return items.sort((a,b) => b.created_at.localeCompare(a.created_at)); }
export async function saveTransaction(tx: Transaction) { await transactionsStore.setItem(tx.transaction_id, tx); }
export async function getPrices(): Promise<Record<CategoryKey, number> | null> { return settingsStore.getItem<Record<CategoryKey, number>>('price_config'); }
export async function savePrices(prices: Record<CategoryKey, number>) { await settingsStore.setItem('price_config', prices); }
