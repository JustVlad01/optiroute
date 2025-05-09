-- Create the store_information table for storing master file data
CREATE TABLE IF NOT EXISTS store_information (
  id SERIAL PRIMARY KEY,
  image_storage_url TEXT,
  manual TEXT,
  dispatch_code TEXT,
  store_code TEXT,
  store_company TEXT,
  store_name TEXT,
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

-- Index on dispatch_code for faster lookups
CREATE INDEX idx_store_information_dispatch_code ON store_information(dispatch_code);

-- Index on store_code for faster lookups
CREATE INDEX idx_store_information_store_code ON store_information(store_code);

-- Sample insert statements for testing (uncomment and modify as needed)
-- INSERT INTO store_information (dispatch_code, store_code, store_name, store_name_1, address_line_1, eircode, location_link)
-- VALUES
--   ('1001C', '30893', 'Circle K - Gallowshill', 'Circle K', '66 South Mall Street', 'T12Y822', 'https://maps.google.com/?q=...'); 