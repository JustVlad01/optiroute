export interface StoreOrder {
  id?: string;
  storeCode: string;
  storeName: string;
  quantity: number;
  route: string;
  deliveryDate: string;
  imported?: boolean;
}

export interface OrderImport {
  route: string;
  deliveryDate: string;
  orders: StoreOrder[];
} 