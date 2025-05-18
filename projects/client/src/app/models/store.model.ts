export interface Store {
  store_id: number;
  image_storage_url?: string;
  manual?: string;
  dispatch_code?: string;
  store_code?: string;
  store_company?: string;
  store_name?: string;
  address_line?: string;
  geolocation?: string;
  eircode?: string;
  old_route?: string;
  new_route_08_05?: string;
  route8_5_25?: string;
  location_link?: string;
  door_code?: string;
  alarm_code?: string;
  fridge_code?: string;
  keys_available?: string;
  key_code?: string;
  hour_access_24?: string;
  earliest_delivery_time?: string;
  opening_time_saturday?: string;
  opening_time_sunday?: string;
  openining_time_bank_holiday?: string;
} 