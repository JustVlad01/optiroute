export interface StoreOrder {
  id?: string;
  storeCode: string;
  storeName: string;
  quantity: number;
  deliveryDate: string;
  imported?: boolean;
  batchId?: string;
  importDate?: string;
}

export interface OrderImport {
  deliveryDate: string;
  orders: StoreOrder[];
  batchId?: string;
} 