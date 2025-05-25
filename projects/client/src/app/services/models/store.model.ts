export interface Store {
  id: string;
  manual?: string;
  images?: string;
  dispatch_code?: string;
  dispatch_store_name?: string;
  site_id?: string;
  store_code?: string;
  store_company?: string;
  store_name?: string;
  address_line?: string;
  city?: string;
  county?: string;
  eircode?: string;
  latitude?: string;
  longitude?: string;
  route?: string;
  alarm_code?: string;
  deliver_monday?: string;
  deliver_tuesday?: string;
  deliver_wednesday?: string;
  deliver_thursday?: string;
  deliver_friday?: string;
  deliver_saturday?: string;
  fridge_code?: string;
  keys_available?: string;
  key_code?: string;
  prior_registration_required?: string;
  hour_access_24?: string;
  openining_time_bankholiday?: string;
  opening_time_weekdays?: string;
  opening_time_sat?: string;
  opening_time_sun?: string;
  email?: string;
  phone?: string;
}

export interface StoreLocation {
  lat?: string;
  lng?: string;
}

export interface StoreDetails {
  id: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  county?: string;
  eircode?: string;
  location?: StoreLocation;
} 