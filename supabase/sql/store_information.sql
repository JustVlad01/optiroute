CREATE TABLE store_information (
  id SERIAL PRIMARY KEY,
  image_storage_url TEXT,
  manual TEXT,
  dispatch_code TEXT,
  store_name TEXT,
  store_code TEXT,
  store_name_1 TEXT,
  store_name_future TEXT,
  address_line_1 TEXT,
  old_route TEXT,
  new_route_15_04 TEXT,
  date_21_04 TEXT,
  eircode TEXT,
  location_link TEXT,
  door_code TEXT,
  alarm_code TEXT,
  fridge_code TEXT,
  keys_available TEXT,
  prior_registration_required TEXT,
  hour_access_24 TEXT,
  mon TEXT,
  tue TEXT,
  wed TEXT,
  thur TEXT,
  fri TEXT,
  sat TEXT,
  earliest_delivery_time TEXT,
  opening_time_saturday TEXT,
  openining_time_bankholiday TEXT,
  delivery_parking_instructions TEXT,
  UNIQUE(dispatch_code, store_code)
);

-- Index on store_name for faster lookups when dispatch_code and store_code are not available
CREATE INDEX idx_store_information_store_name ON store_information(store_name);

